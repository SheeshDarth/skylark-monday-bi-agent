"""Skylark Drones — Monday.com Business Intelligence Agent.

Conversational agent that answers founder-level BI questions by querying
monday.com live via Claude's MCP connector (no local caching of board data).
"""
import os

import anthropic
import streamlit as st

MODEL = "claude-opus-5"
MONDAY_MCP_URL = "https://mcp.monday.com/mcp"

SYSTEM_PROMPT = """You are a business intelligence assistant for Skylark Drones founders and executives.

You have live, read-only access to two monday.com boards via MCP tools:
1. Deals board ("Deal Funnel") — columns: Deal Name, Owner code, Client Code, Deal Status, Close Date (A), Closure Probability, Masked Deal value, Tentative Close Date, Deal Stage, Product deal, Sector/service, Created Date
2. Work Orders board ("Work Order Tracker") — 49 columns covering execution status, billing/invoicing amounts (masked), quantities, sector, type of work, and collection status

DATA QUALITY RULES — this is real-world messy data, handle it as follows:
- Deal Status and billing-status fields have inconsistent casing ("Open" vs "open", "BIlled" vs "Fully Billed" vs "Partially Billed", "Not billable" vs "Not Billable") — normalize these before counting or grouping.
- Quantity fields mix units inline (e.g. "5360 HA", "4", "NA") — treat "NA" as missing, not zero, and strip unit suffixes before doing arithmetic.
- Some rows are corrupted test data (e.g. placeholder names sitting in a Deal Name field with every other field blank, or exact duplicate rows) — exclude these from any aggregate, and say when you've excluded rows.
- Many fields (Close Date, Closure Probability, Masked Deal value) are frequently blank — never silently treat blank as zero; call out the gap in your answer.
- Never state a number without noting whether records were missing or excluded from it.

When answering:
- Query the boards live via your MCP tools every time — never rely on memory of a previous answer, the data can change between turns.
- Give founder-level insight, not a raw data dump: explain what a number means (e.g. "pipeline is healthy in the energy sector but 3 renewables deals have had no status update in 30+ days"), don't just report totals.
- If asked to prepare something for a "leadership update", format the answer as a short markdown block: one headline stat, 2-3 supporting bullets, one flagged risk or data-quality caveat — suitable for pasting into a leadership email or slide.
- Ask a clarifying question if the request is ambiguous (e.g. "this quarter" — confirm which quarter if it isn't clear from context)."""

st.set_page_config(page_title="Skylark BI Agent", page_icon="📊")
st.title("Skylark Business Intelligence Agent")
st.caption("Ask about deal pipeline, work order status, or billing — pulled live from monday.com.")

if "ANTHROPIC_API_KEY" not in os.environ or "MONDAY_TOKEN" not in os.environ:
    st.error(
        "Missing required secrets. Set ANTHROPIC_API_KEY and MONDAY_TOKEN "
        "(Streamlit Cloud: Settings -> Secrets; local: .env)."
    )
    st.stop()

if "messages" not in st.session_state:
    st.session_state.messages = []

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if user_input := st.chat_input("e.g. How's our pipeline looking for the energy sector this quarter?"):
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.markdown(user_input)

    with st.chat_message("assistant"):
        with st.spinner("Querying monday.com..."):
            client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            response = client.beta.messages.create(
                model=MODEL,
                max_tokens=4096,
                betas=["mcp-client-2025-11-20"],
                system=SYSTEM_PROMPT,
                mcp_servers=[{
                    "type": "url",
                    "url": MONDAY_MCP_URL,
                    "name": "monday",
                    "authorization_token": os.environ["MONDAY_TOKEN"],
                }],
                tools=[{"type": "mcp_toolset", "mcp_server_name": "monday"}],
                messages=[
                    {"role": m["role"], "content": m["content"]}
                    for m in st.session_state.messages
                ],
            )
            answer = "".join(block.text for block in response.content if block.type == "text")

        st.markdown(answer)
        st.session_state.messages.append({"role": "assistant", "content": answer})
