"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const EXAMPLES = [
  "How's our pipeline looking by sector?",
  "What's at risk in billing and collections?",
  "Which sectors have deals but no active work orders?",
  "Prepare a leadership update on pipeline health.",
];

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(question: string) {
    if (!question.trim() || busy) return;

    const history: Message[] = [...messages, { role: "user", content: question }];
    setMessages(history);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: "Request failed." }));
        setMessages([...history, { role: "assistant", content: `**Error:** ${error}` }]);
        return;
      }

      // Append an empty turn, then fill it as chunks arrive.
      setMessages([...history, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: text }]);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setMessages([...history, { role: "assistant", content: `**Error:** ${detail}` }]);
    } finally {
      setBusy(false);
    }
  }

  const waiting = busy && messages[messages.length - 1]?.role === "user";

  return (
    <main className="shell">
      <header>
        <h1>Skylark BI Agent</h1>
        <p>Live answers from the deal funnel and work order boards on monday.com.</p>
      </header>

      <div className="thread">
        {messages.length === 0 && (
          <div className="examples">
            {EXAMPLES.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <article key={i} className={m.role}>
            <span className="who">{m.role === "user" ? "You" : "Agent"}</span>
            <div className="bubble">{m.content}</div>
          </article>
        ))}

        {waiting && (
          <article className="assistant">
            <span className="who">Agent</span>
            <div className="bubble pending">Querying monday.com…</div>
          </article>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about pipeline, billing, or execution status…"
          disabled={busy}
          aria-label="Your question"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </main>
  );
}
