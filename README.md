# Skylark Business Intelligence Agent

Conversational BI app for founder-level questions across two live monday.com boards:

- `Deal funnel Data.xlsx - Deal tracker`
- `Work_Order_Tracker Data.xlsx - work order tracker`

The app reads monday.com through the GraphQL API on every request, normalizes the live rows into a compact snapshot, and asks OpenAI to produce the executive answer from that snapshot. No CSV data is shipped with the app.

## Architecture

```text
Browser (app/page.tsx)
   |  POST /api/chat  -- streamed text/plain
   v
Next.js route (app/api/chat/route.ts)
   |  monday GraphQL API -> two board snapshots
   |  OpenAI Responses API -> streamed answer
   v
Founder-facing BI response with caveats and exclusions
```

The monday token stays server-side. The browser only sees streamed answer text.

## Setup

### 1. monday.com

Both boards must exist in monday.com. This repo is configured to use board IDs:

| Board | ID |
|---|---:|
| Deal funnel Data.xlsx - Deal tracker | `5030221367` |
| Work_Order_Tracker Data.xlsx - work order tracker | `5030220660` |

If you re-import the CSVs and get new board IDs, update `lib/config.ts`.

### 2. Environment

```bash
npm install
cp .env.example .env.local
```

Add real values:

```env
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5.5
MONDAY_TOKEN=your-monday-personal-api-token
```

`OPENAI_MODEL` is optional; it defaults to `gpt-5.5`.

### 3. Run locally

```bash
npm run smoke
npm run dev
```

Use the full live behaviour suite with:

```bash
npm run smoke -- --all
```

If your shell does not load `.env.local` automatically:

```bash
node --env-file=.env.local scripts/smoke-test.mjs
```

### 4. Deploy

Deploy on Vercel and add:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` if overriding the default
- `MONDAY_TOKEN`

## Files

| Path | Purpose |
|---|---|
| `app/page.tsx` | Executive BI chat UI |
| `app/api/chat/route.ts` | OpenAI streaming route + live monday snapshot fetch |
| `lib/monday.ts` | monday GraphQL client and snapshot formatter |
| `lib/config.ts` | Model, board IDs, board names, and system prompt |
| `scripts/smoke-test.mjs` | Live monday + OpenAI pre-deploy check |
| `PRD.md` / `TRD.md` / `DECISION_LOG.md` | Requirements, technical design, decisions |

## Known Limitations

- The app fetches up to 500 items per board. Current boards are under that limit.
- Data cleaning is still model-enforced after deterministic snapshot shaping.
- Repeated questions re-query monday.com; there is no cache.
- The route is capped at 60 seconds on Vercel Hobby.
