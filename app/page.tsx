"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const EXAMPLES = [
  {
    label: "Pipeline",
    questions: [
      "How's our pipeline looking by sector?",
      "Which open deals have the highest masked value concentration?",
    ],
  },
  {
    label: "Billing",
    questions: [
      "What's at risk in billing and collections?",
      "Which work orders are stuck or need billing updates?",
    ],
  },
  {
    label: "Cross-board",
    questions: [
      "Which sectors have deals but no active work orders?",
      "Prepare a leadership update on pipeline health.",
    ],
  },
];

const SOURCES = [
  { label: "Deal funnel", meta: "5030221367" },
  { label: "Work orders", meta: "5030220660" },
  { label: "Model", meta: "OpenAI" },
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

    const history: Message[] = [...messages, { role: "user", content: question.trim() }];
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
        setMessages([...history, { role: "assistant", content: `Error: ${error}` }]);
        return;
      }

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
      setMessages([...history, { role: "assistant", content: `Error: ${detail}` }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(input);
  }

  const waiting = busy && messages[messages.length - 1]?.role === "user";

  return (
    <main className="app-shell">
      <aside className="source-rail" aria-label="Live data sources">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <h1>Skylark BI</h1>
            <p>Founder cockpit</p>
          </div>
        </div>

        <div className="source-list">
          {SOURCES.map((source) => (
            <div className="source-item" key={source.label}>
              <span className="live-dot" aria-hidden="true" />
              <div>
                <strong>{source.label}</strong>
                <span>{source.meta}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Live monday.com intelligence</p>
            <h2>Ask across pipeline, execution, billing, and board gaps.</h2>
          </div>
          <div className="status-pill">
            <span className="live-dot" aria-hidden="true" />
            Direct GraphQL
          </div>
        </header>

        <section className="prompt-grid" aria-label="Suggested questions">
          {EXAMPLES.map((group) => (
            <div className="prompt-card" key={group.label}>
              <h3>{group.label}</h3>
              {group.questions.map((question) => (
                <button key={question} type="button" onClick={() => send(question)} disabled={busy}>
                  {question}
                </button>
              ))}
            </div>
          ))}
        </section>

        <section className="thread-panel" aria-label="Conversation">
          <div className="thread" role="log" aria-live="polite" aria-busy={busy}>
            {messages.length === 0 && (
              <div className="empty-state">
                <h3>Ready for a leadership-grade readout.</h3>
                <p>
                  Choose a prompt above or ask a specific question about sector mix, active work,
                  billing exposure, collections, or missing handoffs.
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
                <span className="who">{message.role === "user" ? "You" : "Agent"}</span>
                <div className="bubble">{message.content}</div>
              </article>
            ))}

            {waiting && (
              <article className="message assistant">
                <span className="who">Agent</span>
                <div className="bubble pending">
                  <span className="loader" aria-hidden="true" />
                  Reading monday boards and calculating the caveats...
                </div>
              </article>
            )}
            <div ref={endRef} />
          </div>
        </section>

        <form className="composer" onSubmit={submit}>
          <label htmlFor="question">Question</label>
          <div className="composer-row">
            <input
              id="question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about pipeline, billing, execution status, or cross-board gaps"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>
              {busy ? "Working" : "Ask"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
