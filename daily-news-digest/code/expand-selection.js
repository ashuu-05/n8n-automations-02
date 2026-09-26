// Expand Selection — Code node
// Extracted from workflow.json for readability. workflow.json is the source of truth.

const raw = $input.first().json.choices[0].message.content;

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  // Models occasionally wrap JSON in prose or a code fence — recover it.
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Model did not return JSON. Got: ' + String(raw).slice(0, 200));
  parsed = JSON.parse(m[0]);
}

const stories = Array.isArray(parsed.stories) ? parsed.stories : [];
if (!stories.length) throw new Error('Model returned no stories.');

// Reattach the original article for each selected id.
const articles = $('Aggregate').first().json.articles;
const byId = new Map(articles.map((a) => [a.id, a]));

return stories
  .sort((a, b) => (a.rank || 99) - (b.rank || 99))
  .map((s) => {
    const a = byId.get(Number(s.id));
    if (!a) return null;              // ignore a hallucinated id
    return {
      json: {
        id: a.id,
        rank: s.rank || 99,
        category: s.category || 'Companies',
        angle: s.angle || '',
        title: a.title,
        link: a.link,
        date: a.date,
        snippet: a.snippet,
      },
    };
  })
  .filter(Boolean);
