// Clean & Batch — Code node (Run Once for All Items)
// Input: one item per comment page from the YouTube API.
// Output: one item per LLM batch, each carrying its comments + a compact JSON payload.

// Every tunable lives in the Settings node — edit it there, in the n8n UI.
const cfg = $('Settings').first().json;

const BATCH_SIZE = Number(cfg.batchSize) || 80;
const MAX_LEN = Number(cfg.maxCommentLength) || 400;
const MODEL = String(cfg.classifyModel || '').trim();
const SYSTEM_PROMPT = String(cfg.classifyPrompt || '').trim();

if (!MODEL) {
  throw new Error('Settings.classifyModel is empty. Set it to an OpenRouter model slug, e.g. anthropic/claude-haiku-4.5');
}
if (!SYSTEM_PROMPT) {
  throw new Error('Settings.classifyPrompt is empty. Open the Settings node and fill in the classification prompt.');
}

const clean = (s) => String(s || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const seen = new Set();
const comments = [];

for (const page of $input.all()) {
  const threads = page.json && Array.isArray(page.json.items) ? page.json.items : [];
  for (const thread of threads) {
    const s = thread && thread.snippet && thread.snippet.topLevelComment
      ? thread.snippet.topLevelComment.snippet
      : null;
    if (!s) continue;

    let text = clean(s.textOriginal || s.textDisplay);
    if (text.length < 2) continue;

    // Drop near-duplicates (bots, copy-paste spam) on a normalised prefix.
    const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 120);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);

    comments.push({
      id: comments.length,
      text: text.length > MAX_LEN ? text.slice(0, MAX_LEN) + '…' : text,
      author: s.authorDisplayName || '',
      likes: Number(s.likeCount) || 0,
      publishedAt: s.publishedAt || '',
    });
  }
}

if (comments.length === 0) {
  throw new Error(
    'No comments were returned. The video may have comments disabled, ' +
    'or the YouTube API key may lack access.'
  );
}

const batches = [];
for (let i = 0; i < comments.length; i += BATCH_SIZE) {
  const slice = comments.slice(i, i + BATCH_SIZE);
  // Only id + text go to the model — keeps the prompt small and cheap.
  const payload = JSON.stringify(slice.map((c) => ({ id: c.id, text: c.text })));

  batches.push({
    json: {
      batchIndex: batches.length,
      totalComments: comments.length,
      comments: slice,
      payload,
      // The HTTP node sends this verbatim.
      body: {
        model: MODEL,
        temperature: Number(cfg.classifyTemperature) || 0,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'Comments:\n' + payload },
        ],
      },
    },
  });
}

return batches;
