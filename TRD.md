# TRD — Skylark Business Intelligence Agent

## Stack

Next.js 15 (App Router) on Vercel · TypeScript · Anthropic SDK · `claude-opus-5`

No database, no ORM, no state store. The boards are the source of truth and are read live on every turn.

## Request path

```
app/page.tsx  --POST /api/chat-->  app/api/chat/route.ts
                                        |
                                        +- validates the transcript (trust boundary)
                                        +- client.beta.messages.stream({
                                             betas: ["mcp-client-2025-11-20"],
                                             mcp_servers: [{ type:"url",
                                                             url:"https://mcp.monday.com/mcp",
                                                             authorization_token: MONDAY_TOKEN }],
                                             tools: [{ type:"mcp_toolset", mcp_server_name:"monday" }],
                                           })
                                        |
                                        +- text deltas --> ReadableStream --> browser
```

The MCP connector runs the tool loop **server-side inside Anthropic's infrastructure**. Claude picks the boards, issues the queries, and reasons over the results without a round trip back to our function per tool call. Our route is a thin, streaming pass-through.

`MONDAY_TOKEN` is read from the environment inside the route handler. It is never sent to the browser and never appears in a client bundle.

## Why not a hand-rolled pipeline

| Rejected | Why |
|---|---|
| GraphQL client + local cleaning + a second LLM call | Duplicates what the connector already does server-side; three failure points instead of one, on a 6-hour budget |
| Self-hosted MCP server | monday.com publishes an official hosted one; self-hosting buys nothing here |
| Text-to-SQL over a local cache | Violates "query monday.com dynamically"; adds cache invalidation nobody asked for |

## Data model

Read directly from the supplied CSVs, not inferred.

**`Deal tracker`** — 12 columns:
`Deal Name, Owner code, Client Code, Deal Status, Close Date (A), Closure Probability, Masked Deal value, Tentative Close Date, Deal Stage, Product deal, Sector/service, Created Date`

Dates are ISO `YYYY-MM-DD`. `Deal Stage` is alphabetically prefixed to encode funnel order (`B. Sales Qualified Leads`).

**`work order tracker`** — 38 columns covering execution status, six masked amount variants (excl/incl GST x ordered/billed/collected/receivable), quantities, and invoice/collection/billing status.

> The Work Order CSV's **first row is blank**; the real header is row 2. Delete row 1 before importing or monday.com produces 38 unnamed columns. This is the single most likely setup failure.

**Join key:** `Deal Name` (board 1) <-> `Deal name masked` (board 2), matched as exact strings since both are masked.

## Data-quality handling

Enforced through the system prompt in `lib/config.ts`, not through code:

| Issue (confirmed in the source data) | Rule |
|---|---|
| Status casing/spelling drift (`BIlled` / `Fully Billed`; `Not billable` / `Not Billable`) | Normalize before grouping |
| Quantities with inline units (`5360 HA`, `4`, `NA`) | Strip suffixes; `NA` is missing, never zero |
| Impossible negatives (negative balance against a positive ordered quantity) | Flag as suspect, don't average in |
| Frequently blank fields (Close Date, Closure Probability, Masked Deal value) | Exclude from the aggregate and report the count |
| Junk rows (name-only rows, exact duplicates) | Exclude and disclose |
| Header inconsistency (`Exl.` vs `Excl`) | Match loosely |
| Masked amounts | Safe for ratios and trends; never presented as real rupee figures |

**Why prompt-based rather than a cleaning pipeline:** most of this messiness needs judgment, not a regex — deciding whether a row is corrupt test data or a real record with sparse fields, or whether two status spellings mean the same thing. A fixed rule set handles the mechanical half and silently mangles the rest. The trade-off, and what a production version would do instead, is in `DECISION_LOG.md`.

## Known limitations

- **Vercel function timeout.** `maxDuration = 60` (Hobby ceiling; Pro allows 300). MCP tool calls complete *before* the first token streams, so a slow multi-board query spends that budget with the user watching a spinner. Mitigated by streaming and an explicit "Querying monday.com..." state; a genuinely slow query would need the Pro tier or a background-job pattern.
- **No caching.** Every question re-queries monday.com. Correct per the brief, but repeated questions pay full latency each time.
- **No conversation compaction.** A long session will eventually exceed the context window. Fine for a demo, not for sustained use.
- **Single shared credential.** One `MONDAY_TOKEN` for all users of the deployment.
- **Cleaning is prompt-enforced, not code-enforced.** An unusual row could be classified wrongly, and there is no deterministic guarantee the same row is treated the same way twice.
- **Board names are hardcoded** in `lib/config.ts`. Renaming a board in monday.com breaks discovery until the constant is updated.
- **No automated tests** beyond `scripts/smoke-test.mjs`, which is a live connectivity and behaviour check rather than a unit test.
