import Anthropic from "@anthropic-ai/sdk";

import { MODEL, MONDAY_MCP_URL, SYSTEM_PROMPT } from "@/lib/config";

export const runtime = "nodejs";
// Vercel Hobby caps at 60s; Pro allows 300. MCP tool calls run before any text
// streams, so a slow board query eats this budget before the user sees a token.
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

/** Reject anything that isn't a well-formed transcript — this is a trust boundary. */
function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const { messages } = body as { messages?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) return null;

  const parsed: ChatMessage[] = [];
  for (const m of messages) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > 10_000) return null;
    parsed.push({ role, content });
  }
  return parsed;
}

export async function POST(req: Request) {
  const mondayToken = process.env.MONDAY_TOKEN;
  if (!process.env.ANTHROPIC_API_KEY || !mondayToken) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY or MONDAY_TOKEN." },
      { status: 500 },
    );
  }

  const messages = parseMessages(await req.json().catch(() => null));
  if (!messages) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          betas: ["mcp-client-2025-11-20"],
          system: SYSTEM_PROMPT,
          mcp_servers: [
            {
              type: "url",
              url: MONDAY_MCP_URL,
              name: "monday",
              authorization_token: mondayToken,
            },
          ],
          tools: [{ type: "mcp_toolset", mcp_server_name: "monday" }],
          messages,
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        // The response has already begun, so surface the failure in-band rather
        // than as a status code the client can no longer read.
        const detail = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n\n**Request failed:** ${detail}`));
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
