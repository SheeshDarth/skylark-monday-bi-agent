/**
 * Pre-deploy check: can the agent actually reach both monday.com boards?
 *
 * Run this the moment you have both tokens, before touching anything else.
 * MCP auth failures surface only when a tool call runs, so a bad token looks
 * fine right up until the demo.
 *
 *   node --env-file=.env.local scripts/smoke-test.mjs
 *   node --env-file=.env.local scripts/smoke-test.mjs --all
 */
import Anthropic from "@anthropic-ai/sdk";

const { MODEL, MONDAY_MCP_URL, SYSTEM_PROMPT } = await import("../lib/config.ts");

// These double as the manual test suite for the deployed app — each maps to a
// user story in PRD.md.
const QUESTIONS = [
  "List the boards you can see and how many rows each has. Don't analyze, just confirm access.",
  "How's our deal pipeline looking by sector? Flag any data quality issues you hit.",
  "What's our billing and collection status across work orders? Anything at risk?",
  "Which sectors have deals but no active work orders?",
  "Prepare a leadership update on pipeline health.",
];

const missing = ["ANTHROPIC_API_KEY", "MONDAY_TOKEN"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Anthropic();

async function ask(question) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    betas: ["mcp-client-2025-11-20"],
    system: SYSTEM_PROMPT,
    mcp_servers: [
      {
        type: "url",
        url: MONDAY_MCP_URL,
        name: "monday",
        authorization_token: process.env.MONDAY_TOKEN,
      },
    ],
    tools: [{ type: "mcp_toolset", mcp_server_name: "monday" }],
    messages: [{ role: "user", content: question }],
  });

  return {
    text: res.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
    usedMcp: res.content.some((b) => b.type === "mcp_tool_use" || b.type === "mcp_tool_result"),
  };
}

const all = process.argv.includes("--all");
const suite = all ? QUESTIONS : QUESTIONS.slice(0, 1);
let clean = true;

for (const [i, q] of suite.entries()) {
  console.log(`\n${"=".repeat(70)}\nQ${i + 1}: ${q}\n${"-".repeat(70)}`);
  try {
    const { text, usedMcp } = await ask(q);
    console.log(text);
    if (!usedMcp) {
      console.log("\n!! Answered WITHOUT calling monday.com — check the MCP connection.");
      clean = false;
    }
  } catch (err) {
    console.error(`\n!! Failed: ${err.message}`);
    clean = false;
  }
}

console.log(`\n${"=".repeat(70)}`);
if (!clean) {
  console.error("Smoke test FAILED — fix before deploying.");
  process.exit(1);
}
console.log(all ? "All questions answered from live board data." : "Connection OK. Run with --all for the full suite.");
