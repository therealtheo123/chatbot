# Cloudflare AI Chat Bot

A Cloudflare Worker website with:
- Chat bot UI
- 500 preadded fallback responses
- AI coding helper panel
- OpenAI token input field for live AI responses

## Run locally

```bash
npm install
npm run dev
```

Open the shown localhost URL.

## Deploy

```bash
npm run deploy
```

## Token setup

You can either:
1. Paste token in the website input field (stored in browser localStorage), or
2. Set Worker secret:

```bash
wrangler secret put OPENAI_API_KEY
```

If no token is set, the app still works using 500 preadded responses.
