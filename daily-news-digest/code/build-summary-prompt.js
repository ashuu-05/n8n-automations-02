// Build Summary Prompt — Code node
// Extracted from workflow.json for readability. workflow.json is the source of truth.

const fetched = $input.all();
const selected = $('Expand Selection').all();

const MAX_CHARS = 6000;

const stories = fetched.map((f, i) => {
  const meta = selected[i] ? selected[i].json : {};
  const text = String(f.json.content || '').replace(/\s+/g, ' ').trim();
  const haveText = text.length > 400;

  return {
    id: meta.id,
    rank: meta.rank,
    category: meta.category,
    angle: meta.angle,
    title: meta.title,
    link: meta.link,
    date: meta.date,
    have_full_text: haveText,
    source_text: haveText ? text.slice(0, MAX_CHARS) : '',
    fallback_snippet: meta.snippet || '',
  };
});

const SYSTEM_PROMPT = `You are writing a daily news briefing for someone who follows the US stock market and the AI industry.

For each story you receive, write a summary that tells the reader what happened and why it matters, so they can decide whether to open the link.

LENGTH:
- If have_full_text is true: 4 to 5 sentences, based only on source_text.
- If have_full_text is false: 2 sentences at most, based only on title and fallback_snippet. Write less rather than padding.

GROUNDING — this matters more than style:
- Use only what is in source_text or fallback_snippet. Never add background knowledge.
- Never invent numbers, dates, percentages, quotes, or analyst opinions.
- If the source does not say why something happened, do not supply a reason.
- Vague is better than wrong. A reader who is misled loses more than a reader who is underinformed.

STYLE:
- Lead with the concrete fact, not throat-clearing. Not "In a significant development..." but "Pfizer agreed to..."
- Include specific figures when the source gives them.
- No hype adjectives. No "game-changing", "seismic", "landmark".
- Do not restate the headline as your first sentence.

Also tidy the headline: strip any trailing site name or separator, keep the wording otherwise intact.

Respond with JSON only:
{"stories":[{"id":12,"headline":"...","category":"Markets","summary":"..."}]}

Return one entry per input story, keeping the same ids.`;

return [{
  json: {
    storyCount: stories.length,
    fullTextCount: stories.filter((s) => s.have_full_text).length,
    body: {
      model: 'anthropic/claude-sonnet-4.5',
      temperature: 0.3,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(stories) },
      ],
    },
  },
}];
