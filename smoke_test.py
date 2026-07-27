"""Pre-deploy check: can the agent actually reach both monday.com boards?

Run this the moment you have MONDAY_TOKEN + ANTHROPIC_API_KEY, before building
anything else on top. MCP auth failures surface only when a tool call runs, so
a broken token looks fine until mid-demo.

    python smoke_test.py
"""
import os
import sys

import anthropic

from config import MODEL, MONDAY_MCP_URL, SYSTEM_PROMPT

# Doubles as the manual test script for the hosted app — run these in the
# deployed UI too. Each targets one PRD user story.
QUESTIONS = [
    "List the boards you can see and the row count of each. Don't analyze, just confirm access.",
    "How's our deal pipeline looking by sector? Flag any data quality issues you hit.",
    "What's our billing and collection status across work orders? Anything at risk?",
    "Which sectors have deals but no active work orders?",
    "Prepare a leadership update on pipeline health.",
]


def ask(client, question):
    resp = client.beta.messages.create(
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
        messages=[{"role": "user", "content": question}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text")
    used_mcp = any(b.type in ("mcp_tool_use", "mcp_tool_result") for b in resp.content)
    return text, used_mcp


def main():
    missing = [k for k in ("ANTHROPIC_API_KEY", "MONDAY_TOKEN") if k not in os.environ]
    if missing:
        sys.exit(f"Missing env vars: {', '.join(missing)}")

    client = anthropic.Anthropic()
    only_first = "--all" not in sys.argv

    for i, q in enumerate(QUESTIONS[:1] if only_first else QUESTIONS, 1):
        print(f"\n{'=' * 70}\nQ{i}: {q}\n{'-' * 70}")
        text, used_mcp = ask(client, q)
        print(text)
        if not used_mcp:
            print("\n!! Answered without calling monday.com — check the MCP connection.")

    if only_first:
        print(f"\n{'=' * 70}\nConnection OK. Run with --all for the full 5-question suite.")


if __name__ == "__main__":
    main()
