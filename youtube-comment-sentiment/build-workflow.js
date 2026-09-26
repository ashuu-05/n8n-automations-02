// Assembles the n8n workflow JSON from ./nodes and ./prompts.
// Run: node build-workflow.js
const fs = require('fs');
const path = require('path');

const code = (f) => fs.readFileSync(path.join(__dirname, 'nodes', f), 'utf8');
const prompt = (f) => fs.readFileSync(path.join(__dirname, 'prompts', f), 'utf8').trim();

const YT = 'https://www.googleapis.com/youtube/v3';
const OR = 'https://openrouter.ai/api/v1/chat/completions';

// Everything the workflow can be tuned with, surfaced as plain n8n fields so it
// is all editable in the UI after import. Order here is the order shown.
const SETTINGS = [
  ['videoUrl', 'string', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['maxPages', 'number', 20],
  ['commentOrder', 'string', 'relevance'],
  ['batchSize', 'number', 80],
  ['maxCommentLength', 'number', 400],
  ['classifyModel', 'string', 'anthropic/claude-haiku-4.5'],
  ['classifyTemperature', 'number', 0],
  ['classifyPrompt', 'string', prompt('classify-system.txt')],
  ['summaryModel', 'string', 'anthropic/claude-sonnet-4.5'],
  ['summaryTemperature', 'number', 0.3],
  ['summaryPrompt', 'string', prompt('summary-system.txt')],
  ['topAspects', 'number', 8],
  ['quotesPerSection', 'number', 5],
  ['reportFileName', 'string', 'youtube-sentiment-report.html'],
  ['colorPositive', 'string', '#2a78d6'],
  ['colorNeutral', 'string', '#898781'],
  ['colorNegative', 'string', '#e34948'],
  ['colorPositiveDark', 'string', '#3987e5'],
  ['colorNeutralDark', 'string', '#6b6963'],
  ['colorNegativeDark', 'string', '#e66767'],
];

const cfg = (key) => "={{ $('Settings').first().json." + key + ' }}';

// Rebuilt for each page; the first request uses the node's own URL, so the
// pageToken is only ever appended once we have one. Avoids the empty-token 400.
const nextUrl =
  "={{ '" + YT + "/commentThreads?part=snippet&maxResults=100&order=' +" +
  " $('Settings').first().json.commentOrder + '&textFormat=plainText&videoId=' +" +
  " $('Extract Video ID').first().json.videoId + '&pageToken=' + $response.body.nextPageToken }}";

// ---------------------------------------------------------------- the chain
// Each step carries the plain-language note shown under it on the canvas.
const STEPS = [

  { name: 'Start', type: 'n8n-nodes-base.manualTrigger', v: 1, params: {},
    note: '**You press Execute.**\n\nNothing here runs on a schedule or a ' +
      'trigger. The workflow does nothing until you click the button yourself.' },

  { name: 'Settings', type: 'n8n-nodes-base.set', v: 3.4,
    params: {
      assignments: {
        assignments: SETTINGS.map(([name, type, value], i) =>
          ({ id: 's' + (i + 1), name, type, value })),
      },
      options: {},
    },
    note: '**Every dial, in one place.**\n\nPaste your video link into ' +
      '`videoUrl`. This is also where you change the AI models, rewrite the ' +
      'prompts, set how many comments to pull, and pick the report colours — ' +
      'all without opening any code.' },

  { name: 'Extract Video ID', type: 'n8n-nodes-base.code', v: 2,
    params: { mode: 'runOnceForAllItems', jsCode: code('extract-video-id.js') },
    note: '**Reads the link you pasted.**\n\nPulls the 11-character video ID ' +
      'out of it. Understands normal watch links, youtu.be short links, ' +
      'Shorts, live streams, and a bare ID typed on its own.' },

  { name: 'Get Video Info', type: 'n8n-nodes-base.httpRequest', v: 4.2,
    params: {
      url: YT + '/videos',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'part', value: 'snippet,statistics' },
          { name: 'id', value: '={{ $json.videoId }}' },
        ],
      },
      options: {},
    },
    note: '**Asks YouTube about the video itself.**\n\nTitle, channel name, ' +
      'thumbnail, view count, like count. These fill in the header of your ' +
      'report so you know which video it describes.\n\n_Needs the YouTube ' +
      'credential._' },

  { name: 'Fetch Comments', type: 'n8n-nodes-base.httpRequest', v: 4.2,
    params: {
      url: YT + '/commentThreads',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'part', value: 'snippet' },
          { name: 'videoId', value: "={{ $('Extract Video ID').first().json.videoId }}" },
          { name: 'maxResults', value: '100' },
          { name: 'order', value: cfg('commentOrder') },
          { name: 'textFormat', value: 'plainText' },
        ],
      },
      options: {
        pagination: {
          pagination: {
            paginationMode: 'responseContainsNextURL',
            nextURL: nextUrl,
            paginationCompleteWhen: 'other',
            completeExpression: '={{ !$response.body.nextPageToken }}',
            limitPagesFetched: true,
            maxRequests: cfg('maxPages'),
            requestInterval: 250,
          },
        },
      },
    },
    note: '**Downloads the comments.**\n\nYouTube only hands over 100 at a ' +
      'time, so this keeps asking for the next page until it runs out or hits ' +
      'your `maxPages` limit (20 pages = 2,000 comments).\n\nTop-level ' +
      'comments only — replies are skipped.' },

  { name: 'Clean & Batch', type: 'n8n-nodes-base.code', v: 2,
    params: { mode: 'runOnceForAllItems', jsCode: code('clean-and-batch.js') },
    note: '**Tidies the pile up.**\n\nStrips HTML out of the comment text, ' +
      'drops duplicates and copy-paste spam, then splits what is left into ' +
      'stacks of 80.\n\nThe AI reads one stack at a time instead of all ' +
      '2,000 comments at once.' },

  { name: 'Classify Sentiment', type: 'n8n-nodes-base.httpRequest', v: 4.2,
    params: {
      method: 'POST',
      url: OR,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body) }}',
      options: {
        timeout: 180000,
        batching: { batch: { batchSize: 4, batchInterval: 1000 } },
      },
    },
    extra: { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 },
    note: '**The AI reads every comment.**\n\nEach stack goes to the model, ' +
      'which marks every comment positive, negative or neutral and tags what ' +
      'it is about ("audio quality", "too long").\n\nMany small calls, not ' +
      'one huge one: cheaper, more accurate, and if one stack fails the run ' +
      'carries on without it.\n\n_Needs the OpenRouter credential._' },

  { name: 'Aggregate Results', type: 'n8n-nodes-base.code', v: 2,
    params: { mode: 'runOnceForAllItems', jsCode: code('aggregate-results.js') },
    note: '**Adds it all up.**\n\nHow many positive, negative and neutral. ' +
      'Which topics came up most often, split by whether people were praising ' +
      'or complaining. And which comments got the most likes — those become ' +
      'the quotes in your report.' },

  { name: 'Generate Summaries', type: 'n8n-nodes-base.httpRequest', v: 4.2,
    params: {
      method: 'POST',
      url: OR,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body) }}',
      options: { timeout: 180000 },
    },
    extra: { retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 },
    note: '**One last AI call, for the writing.**\n\nIt reads the totals, not ' +
      'the raw comments. It merges topic labels that mean the same thing ' +
      '("audio" and "sound" become one), then writes the plain-English ' +
      'summaries of what people liked and disliked.' },

  { name: 'Build Dashboard', type: 'n8n-nodes-base.code', v: 2,
    params: { mode: 'runOnceForAllItems', jsCode: code('build-dashboard.js') },
    note: '**Draws the report.**\n\nTurns the numbers into a web page: the ' +
      'sentiment bar, the stat boxes, the two topic charts, the summaries and ' +
      'the example comments.\n\nLayout and styling live in this node\'s code.' },

  { name: 'Create HTML File', type: 'n8n-nodes-base.convertToFile', v: 1.1,
    params: {
      operation: 'toText',
      sourceProperty: 'html',
      options: { fileName: cfg('reportFileName'), encoding: 'utf8' },
    },
    note: '**Saves it as a file you can open.**\n\nRun the workflow, then ' +
      'click the download icon in this node\'s output panel. The file opens ' +
      'in any browser and can be emailed or shared as-is.' },
];

// ------------------------------------------------------------------ layout
const X0 = 0, STEP = 260, Y = 0;
const NOTE_Y = 180, NOTE_W = 240, NOTE_H = 230, NOTE_DX = -70;

const nodes = [];
const mkId = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

STEPS.forEach((s, i) => {
  const x = X0 + i * STEP;
  nodes.push(Object.assign({
    parameters: s.params, id: mkId(s.name), name: s.name,
    type: s.type, typeVersion: s.v, position: [x, Y],
  }, s.extra || {}));

  // Plain-language walkthrough note, sitting under its node.
  nodes.push({
    parameters: { content: '### ' + (i + 1) + '. ' + s.name + '\n\n' + s.note,
      height: NOTE_H, width: NOTE_W, color: 7 },
    id: mkId(s.name) + '-note', name: s.name + ' — what this does',
    type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: [x + NOTE_DX, NOTE_Y],
  });
});

// Two notes that are not about a single step.
nodes.push({
  parameters: {
    content: '## YouTube comment sentiment analysis\n\n' +
      'Paste a video link, get a report: how many comments were positive, ' +
      'negative or neutral, what people praised, what they complained about, ' +
      'and the quotes that back it up.\n\n' +
      '### Set this up once, before the first run\n\n' +
      '**1.** Create a **Query Auth** credential named `YouTube API Key` — ' +
      'Name: `key`, Value: your YouTube Data API v3 key.\n' +
      'Select it on *Get Video Info* and *Fetch Comments*.\n\n' +
      '**2.** Create a **Header Auth** credential named `OpenRouter` — ' +
      'Name: `Authorization`, Value: `Bearer sk-or-v1-…`\n' +
      'Select it on *Classify Sentiment* and *Generate Summaries*.\n\n' +
      '**3.** Open **Settings**, paste your link into `videoUrl`, press Execute.\n\n' +
      '_A 2,000-comment run takes a few minutes and costs a few cents. ' +
      'Start with `maxPages` at 5 to try it out._',
    height: 460, width: 480, color: 5,
  },
  id: 'note-setup', name: 'Read me first',
  type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-80, -520],
});

nodes.push({
  parameters: {
    content: '### Before you change the colours\n\n' +
      'The defaults were checked with a colourblind-safety validator.\n\n' +
      'Red/green is the obvious choice for sentiment and the wrong one — the ' +
      'two are hard to tell apart for roughly 8% of viewers. Blue ↔ red ' +
      'passes in both light and dark mode.\n\n' +
      'Change them if you want; just know what the trade is.',
    height: 280, width: 300, color: 3,
  },
  id: 'note-colours', name: 'About the colours',
  type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
  position: [X0 + 9 * STEP + 40, -330],
});

// ------------------------------------------------------------- connections
const connections = {};
for (let i = 0; i < STEPS.length - 1; i++) {
  connections[STEPS[i].name] = {
    main: [[{ node: STEPS[i + 1].name, type: 'main', index: 0 }]],
  };
}

const workflow = {
  name: 'YouTube Comment Sentiment Analysis',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
};

const out = path.join(__dirname, 'workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');

const stickies = nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote').length;
console.log('Wrote ' + out);
console.log('  steps:       ' + STEPS.length);
console.log('  sticky notes:' + stickies);
console.log('  total nodes: ' + nodes.length);
console.log('  size:        ' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
