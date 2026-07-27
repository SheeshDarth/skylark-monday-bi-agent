/**
 * Pre-deploy check: can the app reach monday.com and Gemini?
 *
 *   node --env-file=.env.local scripts/smoke-test.mjs
 *   node --env-file=.env.local scripts/smoke-test.mjs --all
 */

const { GEMINI_MODEL, SYSTEM_PROMPT } = await import("../lib/config.ts");
const { DEALS_BOARD_ID, WORK_ORDERS_BOARD_ID, MONDAY_API_URL } = await import("../lib/config.ts");

const QUESTIONS = [
  "List the live monday boards you received and how many rows each snapshot contains. Do not analyze.",
  "How's our deal pipeline looking by sector? Flag any data quality issues you hit.",
  "What's our billing and collection status across work orders? Anything at risk?",
  "Which sectors have deals but no active work orders?",
  "Prepare a leadership update on pipeline health.",
];

const missing = ["GEMINI_API_KEY", "MONDAY_TOKEN"].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const BOARD_QUERY = `
  query BoardSnapshot($ids: [ID!]!) {
    boards(ids: $ids) {
      id
      name
      items_count
      columns { id title type }
      items_page(limit: 500) {
        items {
          id
          name
          column_values { id text type }
        }
      }
    }
  }
`;

async function fetchSnapshot() {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: process.env.MONDAY_TOKEN,
      "API-Version": "2026-07",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: BOARD_QUERY,
      variables: { ids: [String(DEALS_BOARD_ID), String(WORK_ORDERS_BOARD_ID)] },
    }),
  });

  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.map((error) => error.message).join("; ") || `monday status ${response.status}`);
  }

  const normalize = (board) => {
    const titleById = new Map(board.columns.map((column) => [column.id, column.title]));
    return {
      id: Number(board.id),
      liveName: board.name,
      itemCount: board.items_count,
      fetchedCount: board.items_page.items.length,
      rows: board.items_page.items.map((item) => {
        const values = {};
        for (const value of item.column_values) {
          const text = value.text?.trim();
          if (text) values[titleById.get(value.id) || value.id] = text;
        }
        return { id: item.id, name: item.name, values };
      }),
    };
  };

  const boardsById = new Map(json.data.boards.map((board) => [Number(board.id), board]));
  return {
    fetchedAt: new Date().toISOString(),
    boards: {
      deals: normalize(boardsById.get(DEALS_BOARD_ID)),
      workOrders: normalize(boardsById.get(WORK_ORDERS_BOARD_ID)),
    },
  };
}

const snapshot = await fetchSnapshot();
const snapshotJson = JSON.stringify(snapshot);

async function ask(question) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `LIVE MONDAY SNAPSHOT JSON:\n${snapshotJson}\n\nUSER: ${question}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
    },
  );

  const json = await response.json();
  if (!response.ok || json.error?.message) {
    throw new Error(json.error?.message || `Gemini status ${response.status}`);
  }

  return json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
}

const all = process.argv.includes("--all");
const suite = all ? QUESTIONS : QUESTIONS.slice(0, 1);
let clean = true;

console.log(
  `Read ${snapshot.boards.deals.fetchedCount}/${snapshot.boards.deals.itemCount} deal rows and ` +
    `${snapshot.boards.workOrders.fetchedCount}/${snapshot.boards.workOrders.itemCount} work-order rows.`,
);

for (const [i, question] of suite.entries()) {
  console.log(`\n${"=".repeat(70)}\nQ${i + 1}: ${question}\n${"-".repeat(70)}`);
  try {
    console.log(await ask(question));
  } catch (err) {
    console.error(`\n!! Failed: ${err.message}`);
    clean = false;
  }
}

console.log(`\n${"=".repeat(70)}`);
if (!clean) {
  console.error("Smoke test FAILED - fix before deploying.");
  process.exit(1);
}
console.log(all ? "All questions answered from live board data." : "Connection OK. Run with --all for the full suite.");
