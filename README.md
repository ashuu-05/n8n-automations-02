# n8n Automations

Two n8n workflows that use LLMs to summarise large amounts of text.

| Workflow | What it does |
|---|---|
| [YouTube Comment Sentiment](youtube-comment-sentiment/) | Paste a video link, get an HTML dashboard of comment sentiment, common praise and complaints, and summaries. Handles 2,000+ comments. |
| [Daily News Digest](daily-news-digest/) | Reads 7 RSS feeds at 8pm, picks the top stock market and AI stories, summarises them, emails the result. |

Both import into n8n as-is. Neither contains API keys.

## Requirements

- n8n (Cloud or self-hosted)
- [OpenRouter](https://openrouter.ai) API key (used by both)
- YouTube Data API key (YouTube workflow only)
- Gmail app password (news digest only)

Cost: about $0.05 per YouTube run, and $3-4/month for the news digest.

## Setup

1. Import `workflow.json` from either folder: n8n → Workflows → `...` → Import from File
2. Create the credentials listed in that workflow's README
3. Select them on the HTTP nodes

Each folder has its own README with the details.

## Licence

MIT
