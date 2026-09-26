// Build Email — Code node
// Extracted from workflow.json for readability. workflow.json is the source of truth.

const raw = $input.first().json.choices[0].message.content;

// Providers wrap JSON in code fences — recover it rather than trusting them.
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in response: ' + String(raw).slice(0, 300));
  parsed = JSON.parse(m[0]);
}

const stories = Array.isArray(parsed.stories) ? parsed.stories : [];
if (!stories.length) throw new Error('Model returned no stories.');

// The summaries have no links — reattach them from the selection step.
const byId = new Map($('Expand Selection').all().map((i) => [i.json.id, i.json]));
const sourceCount = $('Aggregate').first().json.articles.length;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CATEGORIES = ['Markets', 'AI & Technology', 'Companies'];

const enriched = stories
  .map((s) => {
    const meta = byId.get(Number(s.id)) || {};
    return {
      headline: s.headline || meta.title || '',
      summary: s.summary || '',
      category: CATEGORIES.includes(s.category) ? s.category : 'Companies',
      link: meta.link || '',
      rank: meta.rank || 99,
    };
  })
  .filter((s) => s.headline)
  .sort((a, b) => a.rank - b.rank);

const story = (s) => `
<tr><td style="padding:0 0 26px 0;">
  <a href="${esc(s.link)}" style="color:#0b0b0b;text-decoration:none;font-size:17px;font-weight:600;line-height:1.35;display:block;margin-bottom:7px;">${esc(s.headline)}</a>
  <div style="color:#3f3f3c;font-size:14px;line-height:1.6;margin-bottom:7px;">${esc(s.summary)}</div>
  <a href="${esc(s.link)}" style="color:#2a78d6;text-decoration:none;font-size:13px;">Read more &rarr;</a>
</td></tr>`;

const section = (cat) => {
  const list = enriched.filter((s) => s.category === cat);
  if (!list.length) return '';
  return `
<tr><td style="padding:0 0 12px 0;">
  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#898781;border-bottom:1px solid #e1e0d9;padding-bottom:8px;">${esc(cat)}</div>
</td></tr>${list.map(story).join('')}`;
};

const today = new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York',
});
const shortDate = new Date().toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', timeZone: 'America/New_York',
});

const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f9f9f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e1e0d9;border-radius:10px;padding:28px;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;">
  <tr><td style="padding-bottom:18px;border-bottom:2px solid #0b0b0b;">
    <div style="font-size:20px;font-weight:700;color:#0b0b0b;">Daily Brief</div>
    <div style="font-size:13px;color:#898781;margin-top:3px;">${esc(today)} &middot; ${enriched.length} stories</div>
  </td></tr>
  <tr><td style="height:22px;"></td></tr>
  ${CATEGORIES.map(section).join('')}
  <tr><td style="padding-top:14px;border-top:1px solid #e1e0d9;font-size:11px;color:#898781;">
    Selected from ${sourceCount} headlines across 7 feeds.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

const top = enriched[0] ? enriched[0].headline : 'No major news';
const subject = `Daily Brief — ${shortDate}: ${top.length > 60 ? top.slice(0, 57) + '…' : top}`;

// Plain-text version for clients that refuse HTML.
// Wrap prose at 72 characters — mail clients reflow long lines unpredictably.
const wrap = (s, width = 72, indent = '   ') => {
  const lines = [];
  let line = '';
  for (const w of String(s).split(' ')) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line.trim()); line = w; }
    else { line += ' ' + w; }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.map((l) => indent + l).join('\n');
};

const RULE = '-'.repeat(60);

let n = 0;
const textSections = CATEGORIES.map((cat) => {
  const list = enriched.filter((s) => s.category === cat);
  if (!list.length) return '';
  const body = list.map((s) => {
    n += 1;
    return `${n}. ${s.headline}\n\n${wrap(s.summary)}\n\n   ${s.link}`;
  }).join('\n\n\n');
  return `\n${cat.toUpperCase()}\n${RULE}\n\n${body}\n`;
}).filter(Boolean).join('\n');

const text = `DAILY BRIEF
${today}  |  ${enriched.length} stories
${'='.repeat(60)}
${textSections}
${RULE}
Selected from ${sourceCount} headlines across 7 feeds.`;


return [{ json: { subject, html, text, storyCount: enriched.length } }];
