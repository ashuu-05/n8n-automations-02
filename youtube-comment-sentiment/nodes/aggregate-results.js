// Aggregate Results — Code node (Run Once for All Items)
// Input: one item per OpenRouter classification response.
// Output: a single item with counts, raw aspect tallies and evidence samples.

const SENTIMENTS = ['positive', 'negative', 'neutral'];

// Every tunable lives in the Settings node — edit it there, in the n8n UI.
const cfg = $('Settings').first().json;

const SUMMARY_MODEL = String(cfg.summaryModel || '').trim();
const SUMMARY_PROMPT = String(cfg.summaryPrompt || '').trim();

if (!SUMMARY_MODEL) {
  throw new Error('Settings.summaryModel is empty. Set it to an OpenRouter model slug, e.g. anthropic/claude-sonnet-4.5');
}
if (!SUMMARY_PROMPT) {
  throw new Error('Settings.summaryPrompt is empty. Open the Settings node and fill in the summary prompt.');
}

// Rebuild the full comment list from the batching node.
const byId = new Map();
for (const b of $('Clean & Batch').all()) {
  for (const c of b.json.comments) byId.set(c.id, { ...c });
}

const parseContent = (raw) => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  // Models occasionally wrap JSON in prose or a code fence — recover the object.
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
};

const counts = { positive: 0, negative: 0, neutral: 0 };
const aspects = { positive: {}, negative: {}, neutral: {} };
let classified = 0;
let failedBatches = 0;

for (const item of $input.all()) {
  const j = item.json || {};
  const raw = j.choices && j.choices[0] && j.choices[0].message
    ? j.choices[0].message.content
    : null;

  const parsed = parseContent(raw);
  if (!parsed || !Array.isArray(parsed.results)) { failedBatches++; continue; }

  for (const r of parsed.results) {
    const c = byId.get(Number(r.id));
    if (!c || c.sentiment) continue; // skip unknown ids and double-counting

    const s = SENTIMENTS.includes(r.sentiment) ? r.sentiment : 'neutral';
    c.sentiment = s;
    counts[s]++;
    classified++;

    const list = Array.isArray(r.aspects) ? r.aspects.slice(0, 2) : [];
    for (const a of list) {
      const k = String(a).toLowerCase().trim()
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ');
      if (k.length < 3) continue;
      aspects[s][k] = (aspects[s][k] || 0) + 1;
    }
  }
}

if (classified === 0) {
  throw new Error(
    'Every classification batch failed to parse. Check the OpenRouter credential, ' +
    'the model slug, and the "Classify Sentiment" node output.'
  );
}

const topN = (obj, n) => Object.entries(obj)
  .sort((a, b) => b[1] - a[1])
  .slice(0, n)
  .map(([aspect, count]) => ({ aspect, count }));

const all = [...byId.values()];
const sample = (s, n) => all
  .filter((c) => c.sentiment === s)
  .sort((a, b) => b.likes - a.likes)
  .slice(0, n)
  .map((c) => ({ text: c.text.slice(0, 220), likes: c.likes, author: c.author }));

const pct = (n) => (classified ? Number(((n * 100) / classified).toFixed(1)) : 0);

const v = $('Get Video Info').first().json;
const vid = v && Array.isArray(v.items) && v.items[0] ? v.items[0] : {};
const snip = vid.snippet || {};
const stat = vid.statistics || {};

const result = {
  video: {
    title: snip.title || 'Unknown video',
    channel: snip.channelTitle || '',
    publishedAt: snip.publishedAt || '',
    thumbnail: (snip.thumbnails && snip.thumbnails.medium && snip.thumbnails.medium.url) || '',
    views: Number(stat.viewCount) || 0,
    likes: Number(stat.likeCount) || 0,
    totalComments: Number(stat.commentCount) || 0,
    url: $('Extract Video ID').first().json.videoUrl,
  },
  stats: {
    fetched: byId.size,
    classified,
    failedBatches,
    positive: counts.positive,
    negative: counts.negative,
    neutral: counts.neutral,
    positivePct: pct(counts.positive),
    negativePct: pct(counts.negative),
    neutralPct: pct(counts.neutral),
  },
  rawAspects: {
    positive: topN(aspects.positive, 40),
    negative: topN(aspects.negative, 40),
    neutral: topN(aspects.neutral, 15),
  },
  samples: {
    positive: sample('positive', 12),
    negative: sample('negative', 12),
    neutral: sample('neutral', 6),
  },
  generatedAt: new Date().toISOString(),
};

// Request body for the summary pass — the HTTP node sends this verbatim.
result.body = {
  model: SUMMARY_MODEL,
  temperature: cfg.summaryTemperature === undefined ? 0.3 : Number(cfg.summaryTemperature),
  max_tokens: 4000,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: SUMMARY_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        video: { title: result.video.title, channel: result.video.channel },
        counts: {
          analysed: result.stats.classified,
          positive: result.stats.positive,
          neutral: result.stats.neutral,
          negative: result.stats.negative,
        },
        raw_aspect_tags: result.rawAspects,
        example_comments: result.samples,
      }),
    },
  ],
};

return [{ json: result }];
