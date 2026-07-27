/**
 * Verifies assignment prompts through the local API without requiring Gemini.
 *
 *   npm run dev
 *   npm run verify:founder
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

const questions = [
  "List the live monday boards you received and how many rows each snapshot contains. Do not analyze.",
  "How's our pipeline looking by sector?",
  "What's at risk in billing and collections?",
  "Which sectors have deals but no active work orders?",
  "Prepare a leadership update on pipeline health.",
];

let passed = true;

for (const question of questions) {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });

  const text = await response.text();
  const ok =
    response.ok &&
    text.length > 80 &&
    !text.includes("Request failed") &&
    !text.includes("GEMINI_API_KEY") &&
    (question.includes("leadership update") ? text.includes("**Headline:**") && text.includes("**Flagged risk:**") : true);

  console.log(`\n${ok ? "PASS" : "FAIL"}: ${question}`);
  console.log(text.slice(0, 700));
  if (!ok) passed = false;
}

if (!passed) {
  process.exit(1);
}
