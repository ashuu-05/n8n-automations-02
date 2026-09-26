# n8n Automations

Two production n8n workflows that use LLMs to turn high-volume, messy input into
something a person can actually read.

Both are importable as-is. Neither contains credentials — they reference n8n
credentials by name, which you create yourself during setup.

| Workflow | What it does | Trigger |
|---|---|---|
| **[YouTube Comment Sentiment](youtube-comment-sentiment/)** | Paste a video link, get an HTML dashboard: sentiment split, most-praised and most-criticised aspects, written summaries, example comments. Handles 2,000+ comments. | Manual |
| **[Daily News Digest](daily-news-digest/)** | Reads seven RSS feeds, picks the day's most important stock-market and AI stories, fetches and summarises them, emails the result. | Daily, 8pm |

## The shared idea

Both solve the same underlying problem: **an LLM cannot read everything, and you
cannot afford for it to try.**

The YouTube workflow takes 2,000 comments and splits them into batches of 80, so
the model makes ~25 cheap classification calls instead of one impossible call.
The news workflow does the reverse — it collapses 130 headlines into a single
call so the model can compare them and rank, because "is this important?" is
only answerable when you can see everything at once.

That is the same lever pulled in two directions. n8n's `Split Out` and
`Aggregate` nodes are how you pull it: they control how many times every
downstream node runs.

Both also assume failure is normal. A dead RSS feed, a blocked article fetch, a
model returning JSON wrapped in a code fence — each is handled and logged rather
than allowed to kill the run. An unattended workflow that fails loudly at 8pm is
worse than one that degrades quietly and tells you what it lost.

## Requirements

- An n8n instance (Cloud or self-hosted)
- An [OpenRouter](https://openrouter.ai) API key — both workflows use it
- Per-workflow extras are listed in each README

Running costs are small: the YouTube workflow is roughly $0.05 per run, the news
digest about $3–4/month.

## Repo layout

```
youtube-comment-sentiment/
  workflow.json          importable n8n workflow
  build-workflow.js      generates workflow.json from the sources below
  nodes/                 the Code node bodies, as editable .js files
  prompts/               the LLM prompts, as editable .txt files
  test-run.js            offline test harness — no API keys, no cost
  sample-report.html     example output

daily-news-digest/
  workflow.json          importable n8n workflow
  code/                  the Code node bodies, as editable .js files
```

The YouTube workflow is *generated* rather than hand-edited: its Code nodes and
prompts live as real files, and `build-workflow.js` assembles them into the
importable JSON. That keeps 17KB of JavaScript out of a single-line JSON string
and makes it testable. See that project's README for the reasoning.

## Licence

MIT
