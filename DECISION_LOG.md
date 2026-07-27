# Decision Log

## Assumptions

- "Founder-level BI queries" means conversational answers that lead with the finding and its implication — not table exports.
- The two boards are the entire data surface; no other Skylark system is in scope.
- "Query monday.com dynamically" is satisfied by the MCP connector reading the boards at answer time. It doesn't require the app to run its own sync layer.
- Masked amount columns are internally consistent, so ratios and trends are meaningful even though absolute figures are not. The agent is told to say so rather than present masked values as rupees.
- A single shared read-scoped token is acceptable for an evaluation prototype.

## Trade-offs

**MCP connector over a hand-rolled GraphQL client.** The connector runs the tool loop server-side, so one API call covers board discovery, querying, and reasoning. A hand-rolled client meant auth, pagination, and a tool-call loop to debug, on a fixed budget, for no capability gain.

**Prompt-enforced data cleaning over a pandas-style pipeline.** This is the decision I'd most expect to be challenged, so: the messiness here is largely judgment work. Deciding whether a sparse row is corrupt test data or a real record with missing fields, or whether two spellings of a status are the same status, isn't reliably expressible as a rule set — and a rule set that gets it wrong fails *silently*, inside an aggregate nobody re-derives. Putting it in the prompt means the model states what it excluded and why, in the answer, where a founder can see it. The cost is determinism: the same row isn't guaranteed identical treatment on two runs. For a prototype graded on handling ambiguity, I took the visibility over the repeatability.

**Next.js on Vercel over Streamlit.** I built the Streamlit version first because it was the faster path to something hosted. Switching cost roughly an hour and bought a real streaming UI, a proper serverless boundary keeping the monday token server-side, and a stack that matches the role. The cost is Vercel's 60s function ceiling (see TRD) — a constraint Streamlit doesn't have.

**No caching layer.** The brief requires dynamic querying. Caching would also reintroduce invalidation logic for a problem nobody has yet.

## What I'd do differently with more time

- **Deterministic pre-clean, then model reasoning.** Normalize casing, strip quantity units, and drop exact duplicates in code, then let the model handle only the genuinely ambiguous rows. Keeps the judgment where judgment is needed and makes the mechanical half repeatable and testable.
- **Tests.** Fixture rows for each known messy pattern, asserting the cleaning rules; plus a mock-MCP test for the route so CI doesn't need live credentials.
- **Surface tool-call progress.** The UI shows a single "Querying monday.com..." state for what may be several tool calls. Streaming the MCP events would make a 40-second query legible instead of worrying.
- **Discover boards by ID, not name.** Board names are currently hardcoded constants; a rename in monday.com silently breaks discovery.
- **Conversation compaction** for long sessions, and **per-user tokens** if this were ever more than a prototype.

## Interpretation of "help prepare data for leadership updates"

Read as an output mode rather than a feature. When a question reads like a request for an update — "prepare an update on X", "summarize X for leadership" — the agent returns a pasteable markdown block instead of a conversational answer: one headline stat, two or three supporting bullets, and one flagged risk or data caveat. The caveat is deliberately part of the format. An update that hides its own data gaps is how a bad number reaches a board meeting.
