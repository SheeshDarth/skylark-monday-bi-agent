import OpenAI from "openai";

import { OPENAI_MODEL, SYSTEM_PROMPT } from "@/lib/config";
import { fetchMondaySnapshot, formatSnapshotForPrompt } from "@/lib/monday";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const { messages } = body as { messages?: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) return null;

  const parsed: ChatMessage[] = [];
  for (const message of messages) {
    if (typeof message !== "object" || message === null) return null;
    const { role, content } = message as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.trim().length === 0 || content.length > 10_000) {
      return null;
    }
    parsed.push({ role, content });
  }
  return parsed;
}

function formatConversation(messages: ChatMessage[]) {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
}

function buildInput(messages: ChatMessage[], snapshotJson: string) {
  return `LIVE MONDAY SNAPSHOT JSON:
${snapshotJson}

CONVERSATION:
${formatConversation(messages)}

Answer the latest user message from the live snapshot.`;
}

export async function POST(req: Request) {
  const mondayToken = process.env.MONDAY_TOKEN;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openAiKey || !mondayToken) {
    return Response.json(
      { error: "Server is missing OPENAI_API_KEY or MONDAY_TOKEN." },
      { status: 500 },
    );
  }

  const messages = parseMessages(await req.json().catch(() => null));
  if (!messages) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const snapshot = await fetchMondaySnapshot(mondayToken);
        const client = new OpenAI({ apiKey: openAiKey });
        const stream = await client.responses.create({
          model: OPENAI_MODEL,
          instructions: SYSTEM_PROMPT,
          input: buildInput(messages, formatSnapshotForPrompt(snapshot)),
          stream: true,
        });

        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(encoder.encode(event.delta));
          }
          if (event.type === "error") {
            controller.enqueue(encoder.encode(`\n\n**Request failed:** ${event.message}`));
          }
        }
        controller.close();
      } catch (err) {
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
