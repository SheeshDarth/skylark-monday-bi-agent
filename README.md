# Skylark Business Intelligence Agent

Conversational agent that answers founder-level questions — *"How's our pipeline looking for the energy sector this quarter?"* — by querying two monday.com boards **live**. No cached data, no CSVs shipped with the app.

Next.js on Vercel; Claude reaches monday.com through the Anthropic MCP connector.

## Architecture

```
Browser (app/page.tsx)
   |  POST /api/chat  -- streamed text/plain
   v
Vercel serverless fn (app/api/chat/route.ts)
   |  Anthropic Messages API + MCP connector
   v
Claude (claude-opus-5) --> mcp.monday.com --> Deal tracker
                                          \-> work order tracker
```

One API call per turn. Claude decides which board to read, issues the MCP tool calls server-side, cleans the data as it reasons (rules in `lib/config.ts`), and streams the answer back. There is no local fetch/clean/aggregate pipeline — see `TRD.md` for why.

## Setup

### 1. Prepare the CSVs

> **Delete row 1 of `Work_Order_Tracker Data.xlsx - work order tracker.csv` before importing.** It is entirely blank; monday.com will otherwise treat it as the header row and produce 38 unnamed columns. The real header is row 2. The Deal funnel CSV is fine as-is.

### 2. monday.com

1. Import both CSVs as two separate boards.
2. Name them **`Deal tracker`** and **`work order tracker`** — these must match `DEALS_BOARD` / `WORK_ORDERS_BOARD` in `lib/config.ts`, or the agent won't find them.
3. Generate a personal API token (Avatar -> Developers -> My access tokens). **Read scope is sufficient** — the brief requires read-only.

### 3. Run locally

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY and MONDAY_TOKEN

npm run smoke                  # verify monday.com is reachable FIRST
npm run dev
```

`npm run smoke` confirms the MCP connection works and both boards are readable, and fails loudly if Claude answers *without* actually calling monday.com. MCP auth errors only surface when a tool call runs, so a bad token otherwise looks fine until mid-demo. Add `-- --all` for the full 5-question suite.

If your shell doesn't load `.env.local` automatically:
`node --env-file=.env.local scripts/smoke-test.mjs`

### 4. Deploy to Vercel

```bash
vercel            # or import the GitHub repo at vercel.com/new
```

Add both env vars in **Project -> Settings -> Environment Variables**, then redeploy. Nothing else to configure — `next build` is detected automatically.

## Files

| Path | Purpose |
|---|---|
| `app/page.tsx` | Chat UI (client component, streams the response) |
| `app/api/chat/route.ts` | Serverless route — Anthropic call + MCP connector |
| `lib/config.ts` | Model, MCP URL, board names, system prompt (incl. data-cleaning rules) |
| `scripts/smoke-test.mjs` | Pre-deploy connection check + the 5 manual test questions |
| `PRD.md` / `TRD.md` / `DECISION_LOG.md` | Requirements, technical design, decisions |

## Known limitations

See `TRD.md` -> Known limitations. The one to know about up front: **Vercel caps function duration at 60s on Hobby**, and MCP tool calls run before any text streams.
