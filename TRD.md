# TRD - Skylark Business Intelligence Agent

## Stack

Next.js 15 App Router, TypeScript, monday.com GraphQL API, OpenAI Responses API.

No database, ORM, or state store. The monday boards are the source of truth and are read live on every turn.

## Request Path

```text
app/page.tsx --POST /api/chat--> app/api/chat/route.ts
                                      |
                                      +- validate transcript
                                      +- fetchMondaySnapshot(MONDAY_TOKEN)
                                      +- OpenAI Responses API stream
                                      |
                                      +- text deltas --> ReadableStream --> browser
```

`MONDAY_TOKEN` and `OPENAI_API_KEY` are read from environment variables inside the route handler. They are never sent to the browser.

## Data Source

The route reads two monday.com boards by numeric ID:

| Board | ID |
|---|---:|
| Deal funnel Data.xlsx - Deal tracker | `5030221367` |
| Work_Order_Tracker Data.xlsx - work order tracker | `5030220660` |

`lib/monday.ts` queries board metadata and up to 500 items per board, maps column IDs to human-readable column titles, drops empty column values from each row, and sends a compact JSON snapshot to OpenAI.

## Data Model

**Deal funnel** - 12 columns:
`Deal Name, Owner code, Client Code, Deal Status, Close Date (A), Closure Probability, Masked Deal value, Tentative Close Date, Deal Stage, Product deal, Sector/service, Created Date`

**Work order tracker** - 38 columns covering execution status, six masked amount variants, quantities, invoice status, collection status, and billing status.

**Join key:** `Deal Name` on board 1 and `Deal name masked` on board 2, matched as exact masked strings.

## Data-Quality Handling

Enforced through `SYSTEM_PROMPT`:

| Issue | Rule |
|---|---|
| Status casing/spelling drift | Normalize before grouping |
| Quantities with inline units | Strip suffixes; treat `NA` as missing |
| Impossible negatives | Flag as suspect |
| Blank fields | Exclude from relevant aggregate and disclose count |
| Junk rows / duplicates | Exclude and disclose |
| Header inconsistency | Match loosely |
| Masked amounts | Use for ratios/trends, not real rupee figures |

## Why Direct GraphQL Instead Of MCP

Direct monday GraphQL is the demo-critical path because it has predictable board IDs, explicit queries, inspectable errors, and easy smoke testing. MCP can still be useful for exploration, but the application should own the board reads that power executive answers.

## Known Limitations

- `items_page(limit: 500)` is enough for the current boards but should be paginated before production scale.
- Data cleaning is prompt-enforced after snapshot shaping, not a deterministic pipeline.
- No caching; every request re-reads monday.
- No long-session conversation compaction.
- One shared monday token and OpenAI key.
- Vercel Hobby route duration is capped at 60 seconds.
