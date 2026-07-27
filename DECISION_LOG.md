# Decision Log

## Key assumptions

- "Founder-level BI queries" means conversational, insight-oriented answers (trends, risk, context) rather than raw row dumps or table exports.
- The two boards are the complete data surface for this exercise — no other Skylark systems are in scope.
- "Query monday.com dynamically" is satisfied by Claude's MCP connector calling the live boards at answer time; it does not require the app to maintain its own polling/sync layer.
- A single shared monday.com token is acceptable for this exercise (no per-user auth).

## Trade-offs chosen and why

| Decision | Alternative considered | Why this one |
|---|---|---|
| Anthropic MCP connector (server-side) over hand-rolled monday.com GraphQL client | Direct `requests` calls to monday.com's GraphQL API | Fewer moving parts under a hard 6-hour cap; the connector already handles the tool-call loop, auth, and result parsing |
| Prompt-based data cleaning over a pandas/code cleaning pipeline | Pre-fetch both boards, clean with pandas, then hand the model a cleaned summary | The known messy-data patterns are contextual (ambiguous casing, judgment calls on which rows are corrupted test data) — better suited to model reasoning than a fixed rule set, and avoids a second data-fetch path competing with the "query dynamically" requirement |
| Streamlit for hosting over a FastAPI + separate frontend | Reuse the FastAPI/Next.js pattern from a prior personal project | Single file, built-in chat components, one-click Streamlit Community Cloud deploy — fastest path to a working hosted demo under time pressure |
| No local caching layer | Cache board data locally, refresh periodically | Brief explicitly requires dynamic querying, not cached/hardcoded data; caching would also reintroduce a staleness/invalidation problem out of scope for this exercise |

## What I'd do differently with more time

- Add a deterministic data-cleaning layer (pandas) as a first pass before handing data to the model, with the model reasoning only over already-normalized values — reduces reliance on the model correctly applying every cleaning rule from the system prompt every time.
- Add automated tests: at minimum, a smoke test that the MCP connection succeeds and a fixture-based test of the cleaning rules against known messy rows.
- Add conversation compaction/summarization for long sessions.
- Support per-user monday.com tokens rather than one shared credential, if this were to go beyond a single-exercise prototype.
- Add a lightweight caching layer with a short TTL (seconds, not minutes) to cut latency on repeated questions without meaningfully violating "query dynamically."

## Interpretation of "the agent should help prepare data for leadership updates"

Implemented as an explicit output mode: when a user's question reads like a request for a leadership update ("prepare an update on X", "summarize X for leadership"), the agent formats its answer as a short markdown block — one headline stat, 2-3 supporting bullets, and one flagged risk or data-quality caveat — designed to be pasted directly into an email or slide, rather than as a long conversational answer.
