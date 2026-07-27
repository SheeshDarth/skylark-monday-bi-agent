# Skylark Business Intelligence Agent

A conversational agent that answers founder-level business questions ("How's our pipeline looking for the energy sector this quarter?") by querying two monday.com boards **live** — no local caching, no hardcoded CSV data.

## Architecture

```
User (Streamlit chat) -> Claude (claude-opus-5)
                              |
                              +-- MCP connector -> mcp.monday.com -> Deals board
                              +-- MCP connector ->                 -> Work Orders board
```

Claude connects directly to monday.com's official hosted MCP server (`https://mcp.monday.com/mcp`) via the Anthropic API's built-in MCP connector. The model decides which board(s) to query, fetches live data, reasons over it (including cleaning/normalizing the known messy-data patterns — see `TRD.md`), and answers in one API call per turn. There is no separate fetch/clean/aggregate pipeline — the data-quality handling lives in the system prompt, and Claude applies it to whatever it reads live.

## Setup

### 1. monday.com

1. Import the two provided CSVs (`Deal Funnel`, `Work Order Tracker`) into monday.com as two separate boards.
2. Generate a personal API token: monday.com -> Avatar -> Admin -> API, or account -> Developers -> My access tokens.
3. Confirm the token has read access to both boards.

### 2. Anthropic

Get an API key from the Anthropic Console.

### 3. Local run

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in ANTHROPIC_API_KEY and MONDAY_TOKEN
export $(cat .env | xargs)   # or use your shell's preferred env-loading method
streamlit run app.py
```

### 4. Deploy (Streamlit Community Cloud)

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. On share.streamlit.io, create a new app pointing at this repo, branch `main`, main file `app.py`.
3. In the app's Settings -> Secrets, add:
   ```toml
   ANTHROPIC_API_KEY = "sk-ant-..."
   MONDAY_TOKEN = "..."
   ```
4. Deploy. The hosted link is testable without any local setup.

## Files

| File | Purpose |
|---|---|
| `app.py` | The agent — Streamlit chat UI + Claude MCP connector call |
| `requirements.txt` | Python dependencies |
| `PRD.md` | Product requirements — problem, users, user stories, success criteria |
| `TRD.md` | Technical design — architecture, data-cleaning rules, MCP integration, limitations |
| `DECISION_LOG.md` | Assumptions, trade-offs, what would change with more time |

## Known limitations

See `TRD.md` -> Known Limitations.
