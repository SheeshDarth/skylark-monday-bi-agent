"""Skylark Drones — Monday.com Business Intelligence Agent.

Conversational agent that answers founder-level BI questions by querying
monday.com live via Claude's MCP connector (no local caching of board data).
"""
import os

import anthropic
import streamlit as st

from config import MODEL, MONDAY_MCP_URL, SYSTEM_PROMPT

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
