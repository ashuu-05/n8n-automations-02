// Offline harness: runs the four Code nodes against mock YouTube + OpenRouter
// data, simulating n8n's $input / $() helpers. Run: node test-run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = (f) => fs.readFileSync(path.join(__dirname, 'nodes', f), 'utf8');
const wrap = (item) => ({ json: item });

// ------------------------------------------------------------- mock fixtures
const POSITIVE = [
  'This explanation finally made it click for me, thank you!',
  'The editing on this is unreal, so clean',
  'Audio quality is fantastic compared to your old videos',
  'Your energy is infectious, never stop',
  'best tutorial on this topic hands down',
  'I love the pacing, nothing felt rushed',
  '🔥🔥🔥',
];
const NEGATIVE = [
  'The background music is way too loud, I can barely hear you',
  'Way too long for what it covers, could have been 5 minutes',
  'Audio keeps clipping, please fix your mic',
  'Clickbait thumbnail, disappointed',
  'Too many ads in a 12 minute video',
];
const NEUTRAL = [
  'What mic are you using?',
  'first',
  '12:04 for the part everyone came for',
  'Anyone else here from the podcast?',
  'Does this work on Windows 11?',
];

function mockPages(total) {
  const pool = [
    ...POSITIVE.map((t) => [t, 'positive']),
    ...NEGATIVE.map((t) => [t, 'negative']),
    ...NEUTRAL.map((t) => [t, 'neutral']),
  ];
  const pages = [];
  let made = 0;
  while (made < total) {
    const items = [];
    for (let i = 0; i < 100 && made < total; i++, made++) {
      const [text, truth] = pool[made % pool.length];
      items.push({
        snippet: {
          topLevelComment: {
            snippet: {
              // Include HTML entities + tags so the cleaner gets exercised.
              textOriginal: text + (made % 7 === 0 ? ' <br>&amp; more' : '') + ' #' + made,
              authorDisplayName: 'viewer' + made,
              likeCount: Math.floor(Math.random() * 400),
              publishedAt: '2026-09-0' + ((made % 9) + 1) + 'T10:00:00Z',
            },
          },
        },
        _truth: truth,
      });
    }
    pages.push({ items, nextPageToken: made < total ? 'tok' + pages.length : undefined });
  }
  return pages;
}

const videoInfo = {
  items: [{
    snippet: {
      title: 'How Transformers Actually Work — A Visual Guide',
      channelTitle: 'Deep Dive Labs',
      publishedAt: '2026-08-20T14:00:00Z',
      thumbnails: { medium: { url: 'https://i.ytimg.com/vi/xxxx/mqdefault.jpg' } },
    },
    statistics: { viewCount: '1284933', likeCount: '61204', commentCount: '3120' },
  }],
};

// --------------------------------------------------------- n8n shim + runner
function run(file, inputItems, nodeOutputs) {
  const ctx = {
    $input: {
      all: () => inputItems,
      first: () => inputItems[0],
    },
    $: (name) => {
      if (!(name in nodeOutputs)) throw new Error('No mock output for node: ' + name);
      const items = nodeOutputs[name];
      return { all: () => items, first: () => items[0] };
    },
    console,
    Buffer,
    JSON, Math, Number, String, Object, Array, Date, Set, Map, RegExp, Error, isNaN,
  };
  vm.createContext(ctx);
  return vm.runInContext('(function(){\n' + src(file) + '\n})()', ctx, { timeout: 20000 });
}

// Pretend to be the model: classify by the fixture's known truth.
function mockClassify(batchItem, { breakOne = false, fenced = false } = {}) {
  const comments = batchItem.json.comments;
  const aspectFor = (t) => {
    const s = t.toLowerCase();
    if (s.includes('audio') || s.includes('mic')) return ['audio quality'];
    if (s.includes('editing')) return ['editing'];
    if (s.includes('music')) return ['background music'];
    if (s.includes('long') || s.includes('minute')) return ['video length'];
    if (s.includes('thumbnail')) return ['thumbnail'];
    if (s.includes('ads')) return ['ads'];
    if (s.includes('pacing') || s.includes('rushed')) return ['pacing'];
    if (s.includes('energy')) return ['host energy'];
    if (s.includes('explanation') || s.includes('tutorial')) return ['explanation clarity'];
    return [];
  };
  const truth = (t) => {
    if (POSITIVE.some((p) => t.startsWith(p))) return 'positive';
    if (NEGATIVE.some((p) => t.startsWith(p))) return 'negative';
    return 'neutral';
  };
  const results = comments.map((c) => ({
    id: c.id, sentiment: truth(c.text), aspects: aspectFor(c.text),
  }));
  if (breakOne) return { json: { error: 'rate limited' } };
  const body = JSON.stringify({ results });
  return { json: { choices: [{ message: { content: fenced ? '```json\n' + body + '\n```' : body } }] } };
}

function mockSummary(agg) {
  const top = (list) => list.slice(0, 6).map((a) => ({
    aspect: a.aspect.replace(/\b\w/g, (c) => c.toUpperCase()), count: a.count,
  }));
  return {
    json: {
      choices: [{
        message: {
          content: JSON.stringify({
            overall: 'The video landed well overall, with praise concentrated on the visual explanations and editing, and a consistent minority complaining about audio levels.',
            positive_summary: 'Viewers repeatedly said the explanation finally made the concept click, and the editing drew unprompted praise.',
            negative_summary: 'The loudest complaint is background music drowning out the narration, followed by the runtime.',
            neutral_summary: 'Mostly gear questions, timestamps and cross-references to the podcast.',
            top_positive_aspects: top(agg.rawAspects.positive),
            top_negative_aspects: top(agg.rawAspects.negative),
            requests: ['Lower the background music', 'A follow-up on attention heads'],
            recommendations: ['Normalise audio to -14 LUFS', 'Cut the intro to under 30 seconds'],
          }),
        },
      }],
    },
  };
}

// ------------------------------------------------------------------ the test
const TOTAL = Number(process.argv[2]) || 1340;
console.log('Simulating ' + TOTAL + ' comments\n');

const outputs = {};

// The Settings node, reconstructed from the same source the builder uses — so a
// field renamed in one place and not the other fails here rather than in n8n.
const settings = {
  videoUrl: 'https://youtu.be/dQw4w9WgXcQ?si=abc',
  maxPages: 20,
  commentOrder: 'relevance',
  batchSize: 80,
  maxCommentLength: 400,
  classifyModel: 'anthropic/claude-haiku-4.5',
  classifyTemperature: 0,
  classifyPrompt: fs.readFileSync(path.join(__dirname, 'prompts', 'classify-system.txt'), 'utf8').trim(),
  summaryModel: 'anthropic/claude-sonnet-4.5',
  summaryTemperature: 0.3,
  summaryPrompt: fs.readFileSync(path.join(__dirname, 'prompts', 'summary-system.txt'), 'utf8').trim(),
  topAspects: 8,
  quotesPerSection: 5,
  reportFileName: 'youtube-sentiment-report.html',
  colorPositive: '#2a78d6', colorNeutral: '#898781', colorNegative: '#e34948',
  colorPositiveDark: '#3987e5', colorNeutralDark: '#6b6963', colorNegativeDark: '#e66767',
};
// Optional second arg overrides Settings, e.g.
//   node test-run.js 500 '{"topAspects":3,"quotesPerSection":1}'
if (process.argv[3]) {
  Object.assign(settings, JSON.parse(process.argv[3]));
  console.log('Settings overridden: ' + Object.keys(JSON.parse(process.argv[3])).join(', ') + '\n');
}
outputs['Settings'] = [wrap(settings)];

// 1. Extract Video ID
const idOut = run('extract-video-id.js', [wrap(settings)], outputs);
outputs['Extract Video ID'] = idOut;
console.log('1. Extract Video ID  ->', idOut[0].json.videoId);

// URL-shape coverage
const shapes = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ&t=30',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://www.youtube.com/live/dQw4w9WgXcQ',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  'dQw4w9WgXcQ',
];
let shapeFails = 0;
for (const s of shapes) {
  try {
    const r = run('extract-video-id.js', [wrap({ videoUrl: s })], outputs);
    if (r[0].json.videoId !== 'dQw4w9WgXcQ') { console.log('   MISMATCH', s, '->', r[0].json.videoId); shapeFails++; }
  } catch (e) { console.log('   THREW   ', s, '-', e.message); shapeFails++; }
}
console.log('   url shapes         ' + (shapes.length - shapeFails) + '/' + shapes.length + ' ok');

outputs['Get Video Info'] = [wrap(videoInfo)];

// 2. Clean & Batch
const pages = mockPages(TOTAL).map(wrap);
const batches = run('clean-and-batch.js', pages, outputs);
outputs['Clean & Batch'] = batches;
console.log('2. Clean & Batch     ->', batches.length, 'batches,',
  batches[0].json.totalComments, 'unique comments after dedupe');

// 3. Classify. With enough batches we deliberately kill one and code-fence
// another, to prove the aggregator survives both.
const injectFaults = batches.length >= 3;
const classified = batches.map((b, i) =>
  mockClassify(b, { breakOne: injectFaults && i === 1, fenced: injectFaults && i === 2 }));
console.log('3. Classify          -> mocked' +
  (injectFaults ? ' (batch 1 fails, batch 2 code-fenced)' : ' (too few batches to inject faults)'));

// 4. Aggregate
const agg = run('aggregate-results.js', classified, outputs);
outputs['Aggregate Results'] = agg;
const st = agg[0].json.stats;
console.log('4. Aggregate Results -> classified', st.classified, '| pos', st.positive,
  '| neu', st.neutral, '| neg', st.negative, '| failed batches', st.failedBatches);
console.log('   percentages        ', st.positivePct + '% / ' + st.neutralPct + '% / ' + st.negativePct + '%',
  '(sum ' + (st.positivePct + st.neutralPct + st.negativePct).toFixed(1) + ')');
console.log('   top positive       ', agg[0].json.rawAspects.positive.slice(0, 3).map((a) => a.aspect + ':' + a.count).join(', '));
console.log('   top negative       ', agg[0].json.rawAspects.negative.slice(0, 3).map((a) => a.aspect + ':' + a.count).join(', '));

// 5. Build Dashboard
const dash = run('build-dashboard.js', [mockSummary(agg[0].json)], outputs);
const html = dash[0].json.html;
fs.writeFileSync(path.join(__dirname, 'sample-report.html'), html, 'utf8');
console.log('5. Build Dashboard   ->', (html.length / 1024).toFixed(1), 'KB -> sample-report.html');

// ---------------------------------------------------------------- assertions
const checks = [
  ['sentiment counts sum to classified', st.positive + st.neutral + st.negative === st.classified],
  ['failed batch was tolerated', injectFaults ? st.failedBatches === 1 : st.failedBatches === 0],
  ['code-fenced JSON recovered', injectFaults ? st.classified > (batches.length - 2) * 80 : true],
  ['html has a doctype', /^<!doctype html>/i.test(html)],
  // The sentiment bar is always drawn; an aspect chart is replaced by an empty
  // state when that sentiment produced no tagged aspects at all.
  ['sentiment bar rendered', html.includes('aria-label="Sentiment share, centred on neutral"')],
  ['aspect charts or empty states', (html.match(/<svg/g) || []).length
    + (html.match(/class="empty"/g) || []).length >= 3],
  ['no unresolved undefined', !/>undefined</.test(html) && !/NaN/.test(html)],
  ['dark mode block present', html.includes('prefers-color-scheme:dark')],
  ['table view present', html.includes('<table')],
  ['legend present', html.includes('class="legend"')],
  ['tooltip layer present', html.includes('id="tip"')],
  ['no unescaped raw comment html', !html.includes('<br>&amp; more')],
  ['quickchart urls built', dash[0].json.previews.sentiment.startsWith('https://quickchart.io/chart?')],
];

// Guard against the Settings node and this harness drifting apart.
const wfPath = path.join(__dirname, 'workflow.json');
if (fs.existsSync(wfPath)) {
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const setNode = wf.nodes.find((n) => n.name === 'Settings');
  const built = setNode ? setNode.parameters.assignments.assignments.map((a) => a.name).sort() : [];
  const mine = Object.keys(settings).sort();
  const missing = built.filter((k) => mine.indexOf(k) < 0);
  const extra = mine.filter((k) => built.indexOf(k) < 0);
  checks.push(['Settings fields match the built workflow',
    missing.length === 0 && extra.length === 0]);
  if (missing.length) console.log('  (in workflow but not tested: ' + missing.join(', ') + ')');
  if (extra.length) console.log('  (tested but not in workflow: ' + extra.join(', ') + ')');
}

console.log('\nAssertions');
let failed = 0;
for (const [label, ok] of checks) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label);
  if (!ok) failed++;
}
console.log('\n' + (failed ? failed + ' FAILED' : 'all ' + checks.length + ' passed'));
process.exit(failed ? 1 : 0);
