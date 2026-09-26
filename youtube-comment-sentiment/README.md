# YouTube Comment Sentiment Analysis

Paste a YouTube link. Get back an HTML dashboard showing how the audience
received the video — the sentiment split, what people praised, what they
criticised, written summaries of each, and the comments that back them up.

Built for videos with thousands of comments. Tested from 7 to 2,400.

> **See it:** [`sample-report.html`](sample-report.html) is real output from the
> test harness. Download it and open in a browser — GitHub won't render it inline.

## What it produces

- **Stat tiles** — total analysed, positive / neutral / negative counts and shares
- **A diverging bar** centred on neutral, showing the sentiment split
- **Two ranked charts** — the aspects viewers praised, and the ones they criticised
- **Written summaries** for each sentiment, grounded in the actual comments
- **The most-liked comments** per sentiment, as evidence
- **A table view** of all aspect counts

Output is a self-contained HTML file you download from the final node. It works
offline, opens in any browser, and can be emailed as-is.

## Setup

**1. Import the workflow.** In n8n: Workflows → `...` → Import from File →
`workflow.json`. Or open the file, copy its contents, and paste onto the canvas.

**2. Create two credentials:**

| Type | Name it | Field `Name` | Field `Value` |
|---|---|---|---|
| Query Auth | `YouTube API Key` | `key` | your YouTube Data API v3 key |
| Header Auth | `OpenRouter` | `Authorization` | `Bearer sk-or-v1-…` |

A YouTube key is free: [console.cloud.google.com](https://console.cloud.google.com)
→ new project → enable "YouTube Data API v3" → Credentials → API key. No billing
card needed.

**3. Select them on the HTTP nodes** — `Get Video Info` and `Fetch Comments` use
the YouTube credential; `Classify Sentiment` and `Generate Summaries` use
OpenRouter.

**4. Open the `Settings` node**, paste your link into `videoUrl`, and run it.

## Configuration

Everything tunable lives in one **Settings** node, as ordinary n8n fields. You
should not need to open a Code node to change behaviour.

| Group | Fields |
|---|---|
| Input | `videoUrl`, `maxPages`, `commentOrder` |
| Batching | `batchSize`, `maxCommentLength` |
| Classification | `classifyModel`, `classifyTemperature`, `classifyPrompt` |
| Summary | `summaryModel`, `summaryTemperature`, `summaryPrompt` |
| Report | `topAspects`, `quotesPerSection`, `reportFileName` |
| Colours | three light + three dark |

Both full prompts are editable text fields — you can rewrite the sentiment
rubric or add aspect categories specific to your channel without touching code.

`maxPages` × 100 is the comment ceiling. Default 20 = 2,000 comments.

## How it works

```
Settings → Extract Video ID → Get Video Info → Fetch Comments (paginated)
  → Clean & Batch → Classify Sentiment (×N) → Aggregate Results
  → Generate Summaries → Build Dashboard → HTML file
```

**Map-reduce, because one call cannot do this.** 2,000 comments will not fit
usefully in a single prompt, and a model asked to classify that many at once
loses accuracy long before it runs out of context. So comments are chunked into
batches of 80, classified in ~25 parallel-ish calls, and the results aggregated.
A second call then writes the summaries from the *aggregate* — counts and merged
aspect tags — never from the raw comments.

That keeps the expensive model reading a small, dense input, and the cheap model
doing the bulk work. Roughly $0.05 per 2,000-comment run.

**Failure is expected and handled.** A classification batch that errors is
skipped, the run continues, and the report's footer says how many were lost. A
model that wraps its JSON in a code fence is recovered by regex rather than
crashing. Comment text is HTML-escaped, so a comment containing markup cannot
inject into the report.

## Why the workflow is generated

`workflow.json` is built by `build-workflow.js` from the files in `nodes/` and
`prompts/`. Editing the JSON directly is possible but unpleasant — the Code
nodes are embedded as single-line escaped strings, and `build-dashboard.js` is
17KB on one line.

```bash
node build-workflow.js      # regenerate workflow.json
node test-run.js 1500       # run the pipeline offline against mock data
```

The test harness simulates n8n's `$input` / `$()` helpers and runs all four Code
nodes end to end with no API keys and no cost. It asserts 14 properties,
including that a failed batch is tolerated, that code-fenced JSON is recovered,
and that raw comment HTML cannot escape into the output.

```
node test-run.js 1340 '{"topAspects":3,"batchSize":200}'
```
passes Settings overrides, so you can check a config change propagates before
spending anything.

**Once you start editing in n8n, n8n is the source of truth.** Rebuilding from
these files would overwrite your changes. Export from n8n first if you want to
bring edits back.

## On the chart colours

The palette is blue / grey / red, not the obvious green / red.

Red–green is the intuitive choice for sentiment and the wrong one: the two are
close to indistinguishable for the ~8% of viewers with deutan or protan colour
vision. Blue↔red was checked with a colourblind-safety validator and clears
separation and contrast thresholds in both light and dark mode.

Labels inside the coloured bars are black rather than white, also by measurement
— black clears 4.5:1 contrast on five of the six fills, white on one. The
exception (dark-mode neutral) gets white via a CSS override.

You can change all six colours in Settings. Just know what the trade is.

## Known limits

- Top-level comments only; replies are not fetched
- Cannot read comments on videos where the owner disabled them
- Aspect clustering is done by the summary model merging synonyms, not by
  embeddings — good enough in practice, occasionally splits a concept in two
- `order=relevance` means that if a video has more comments than `maxPages`
  allows, you get the ones people engaged with rather than an arbitrary slice
