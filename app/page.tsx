"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "Prepare a leadership update on pipeline health.",
  "How's our pipeline looking by sector?",
  "What's at risk in billing and collections?",
  "Which sectors have deals but no active work orders?",
];

const SOURCES = [
  { label: "Deal funnel", meta: "Board 5030221367" },
  { label: "Work orders", meta: "Board 5030220660" },
  { label: "Model", meta: "Gemini Flash-Lite" },
  { label: "Connection", meta: "Direct GraphQL" },
];

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMessage(content: string) {
  if (!content.trim()) return null;

  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  function flushBullets() {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {bullets.map((bullet, index) => (
          <li key={index}>{renderInline(bullet)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }

    flushBullets();
    blocks.push(<p key={`p-${blocks.length}`}>{renderInline(trimmed)}</p>);
  }

  flushBullets();
  return blocks;
}

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
      <section className="workspace">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              S
            </span>
            <div>
              <h1>Skylark BI</h1>
              <p>Founder cockpit</p>
            </div>
          </div>

          <div className="source-chips" aria-label="Live data sources">
            {SOURCES.map((source) => (
              <div className="source-chip" key={source.label}>
                <span className="live-dot" aria-hidden="true" />
                <span>{source.label}</span>
                <strong>{source.meta}</strong>
              </div>
            ))}
          </div>
        </header>

        <section className="intro">
          <div>
            <p className="eyebrow">Live monday.com intelligence</p>
            <h2>Ask the boards. Get a clean business readout.</h2>
            <p>
              Focused answers across pipeline, work orders, billing, and handoff gaps.
              Masked source values stay in masked units.
            </p>
          </div>
          <div className="status-pill" aria-label="Connection status">
            <span className="live-dot" aria-hidden="true" />
            Live snapshot
          </div>
        </section>

        <section className="quick-prompts" aria-label="Suggested questions">
          {QUICK_PROMPTS.map((question) => (
            <button key={question} type="button" onClick={() => send(question)} disabled={busy}>
              {question}
            </button>
          ))}
        </section>

        <section className="thread-panel" aria-label="Conversation">
          <div className="thread-header">
            <span>Conversation</span>
            <span>Fresh monday snapshot per answer</span>
          </div>
          <div className="thread" role="log" aria-live="polite" aria-busy={busy}>
            {messages.length === 0 && (
              <div className="empty-state">
                <h3>Ready for a board-level readout.</h3>
                <p>
                  Ask one specific question, or start with a prompt above.
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
                <span className="who">{message.role === "user" ? "You" : "Agent"}</span>
                <div className="bubble">{renderMessage(message.content)}</div>
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
          <label htmlFor="question">Ask Skylark BI</label>
          <div className="composer-row">
            <input
              id="question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about pipeline, billing, execution status, or cross-board gaps"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>
              {busy ? "Working..." : "Ask"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
