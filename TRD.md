# TRD - Skylark Business Intelligence Agent

## Stack

Next.js 15 App Router, TypeScript, monday.com GraphQL API, Gemini API.

No database, ORM, or state store. The monday boards are the source of truth and are read live on every turn.

## Request Path

```text
app/page.tsx --POST /api/chat--> app/api/chat/route.ts
                                      |
                                      +- validate transcript
                                      +- fetchMondaySnapshot(MONDAY_TOKEN)
                                      +- buildAnalyticsSummary(snapshot)
                                      +- Gemini API response
                                      |
                                      +- text deltas --> ReadableStream --> browser
```

`MONDAY_TOKEN` and `GEMINI_API_KEY` are read from environment variables inside the route handler. They are never sent to the browser.

## Data Source

The route reads two monday.com boards by numeric ID:

| Board | ID |
|---|---:|
| Deal funnel Data.xlsx - Deal tracker | `5030221367` |
| Work_Order_Tracker Data.xlsx - work order tracker | `5030220660` |

`lib/monday.ts` queries board metadata and up to 500 items per board, maps column IDs to human-readable column titles, and drops empty column values from each row. `lib/analytics.ts` converts that live snapshot into deterministic pipeline, billing-risk, and cross-board-gap metrics. Gemini receives that deterministic summary, not the raw board rows.

## Data Model

**Deal funnel** - 12 columns:
`Deal Name, Owner code, Client Code, Deal Status, Close Date (A), Closure Probability, Masked Deal value, Tentative Close Date, Deal Stage, Product deal, Sector/service, Created Date`

**Work order tracker** - 38 columns covering execution status, six masked amount variants, quantities, invoice status, collection status, and billing status.

**Join key:** `Deal Name` on board 1 and `Deal name masked` on board 2, matched as exact masked strings.

## Deterministic Analytics

`buildAnalyticsSummary` computes the assignment-critical facts before the LLM writes:

| Area | Deterministic output |
|---|---|
| Pipeline health | Open-deal count, masked value coverage, sector/stage concentration, top open deals, exclusions |
| Billing risk | Normalized billing statuses, receivable exposure, unbilled exposure, top masked accounts |
| Cross-board gaps | Exact masked-name join, active-work-order coverage, sectors with open deals but no active work order |
| Caveats | Missing values, inactive/missing execution statuses, duplicate masked names |

## Data-Quality Handling

Handled deterministically where possible, then enforced in `SYSTEM_PROMPT` for wording:

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
- Core assignment metrics are deterministic; free-form follow-up questions are limited to the summary sent to Gemini.
- No caching; every request re-reads monday.
- No long-session conversation compaction.
- One shared monday token and Gemini key.
- Gemini free-tier data may be used to improve Google products; use paid tier or stricter controls before production use.
- Vercel Hobby route duration is capped at 60 seconds.
