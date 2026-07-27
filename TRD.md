# TRD — Skylark Business Intelligence Agent

## Architecture

```
Streamlit chat UI (app.py)
    -> client.beta.messages.create(
           model="claude-opus-5",
           mcp_servers=[{type: "url", url: "https://mcp.monday.com/mcp",
                          name: "monday", authorization_token: MONDAY_TOKEN}],
           tools=[{type: "mcp_toolset", mcp_server_name: "monday"}],
           betas=["mcp-client-2025-11-20"],
       )
```

One Anthropic API call per chat turn. Claude's MCP connector calls monday.com's hosted MCP server server-side — the model decides which board(s) and which tool calls are needed, executes them, and returns a final text answer in the same call. No local fetch/clean/aggregate pipeline exists; all data handling happens inside the model's reasoning, guided by the system prompt.

## Why this architecture, not a hand-rolled pipeline

Three simpler alternatives were considered and rejected:
- **Hand-rolled GraphQL client + pandas cleaning + a second LLM call for chat**: more moving parts, more code to get right under time pressure, and duplicates work the MCP connector already does server-side.
- **Self-hosted MCP server**: unnecessary — monday.com publishes an official hosted server at `mcp.monday.com`, requiring only a personal access token.
- **Text-to-SQL / function-calling loop over a local cache**: violates "must query dynamically, don't hardcode CSV data," and adds a caching-invalidation problem the brief doesn't need solved.

## Monday.com integration

- Connector: Anthropic's MCP connector (`mcp_servers` + `mcp_toolset`, beta `mcp-client-2025-11-20`).
- Server: `https://mcp.monday.com/mcp` (official, hosted by monday.com — package `@mondaydotcomorg/monday-api-mcp`).
- Auth: `authorization_token` field on the `mcp_servers` entry, sourced from the `MONDAY_TOKEN` env var. Never hardcoded, never logged.
- Access level: read-only by construction — the app never issues a write/mutation prompt, and the monday.com token should be scoped to read access only.

## Data model (as inspected directly from the source CSVs)

**Deals board ("Deal Funnel")** — 12 columns:
`Deal Name, Owner code, Client Code, Deal Status, Close Date (A), Closure Probability, Masked Deal value, Tentative Close Date, Deal Stage, Product deal, Sector/service, Created Date`

**Work Orders board ("Work Order Tracker")** — 49 columns, including:
`Deal name masked, Customer Name Code, Serial #, Nature of Work, Execution Status, Data Delivery Date, Date of PO/LOI, Probable Start/End Date, Sector, Type of Work, Amount in Rupees (Masked) [6 variants: excl/incl GST, billed, collected, receivable], Quantity by Ops, Quantities as per PO, Quantity billed, Balance in quantity, Invoice/Collection/Billing Status`

## Data-cleaning rules (enforced via system prompt, not code)

| Issue (confirmed present in source data) | Rule |
|---|---|
| Inconsistent status casing (`Open`/`open`; `BIlled`/`Fully Billed`/`Partially Billed`; `Not billable`/`Not Billable`) | Normalize before counting/grouping |
| Quantity fields mix units inline (`5360 HA`, `4`, `NA`) | Strip unit suffixes before arithmetic; treat `NA` as missing, not zero |
| Deliberately corrupted rows (placeholder names with all other fields blank; exact duplicate rows) | Exclude from aggregates; disclose the exclusion |
| Frequently blank fields (Close Date, Closure Probability, Masked Deal value) | Never treat blank as zero; disclose the gap |
| Inconsistent column-header abbreviations (`Exl.` vs `Excl`) | Don't rely on exact header string matching |

**Why prompt-based cleaning instead of a pandas pipeline:** the messiness here is contextual (is this row real or a corrupted test row? does "Open" and "open" mean the same status?) rather than purely mechanical, and Claude reasons about ambiguous cases better than a fixed regex/rule set would under a 6-hour build budget. The trade-off is explicit in `DECISION_LOG.md`.

## Conversational layer

Full session message history is replayed each turn (`st.session_state.messages`) so the model has multi-turn context. No summarization/compaction is implemented — acceptable for a demo-length conversation; would need addressing for long-running sessions (see Known Limitations).

## Known limitations

- **No caching**: every question re-queries monday.com live. Correct per the brief's requirement, but means repeated identical questions cost a fresh API + MCP round trip each time.
- **No conversation compaction**: a very long chat session could eventually hit context limits. Not addressed given the assignment's scope and timeframe.
- **Single shared credential**: one `MONDAY_TOKEN` for the whole app — fine for this exercise, not appropriate for a multi-tenant product.
- **No automated tests**: manual verification only (see `DECISION_LOG.md` for what was tested).
- **Data-quality handling is prompt-based, not code-enforced**: a sufficiently adversarial or ambiguous data row could be misclassified by the model. A production version would likely want deterministic cleaning augmented by model reasoning, not model reasoning alone.
