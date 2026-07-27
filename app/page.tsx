"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";

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
  { label: "Model", meta: "Gemini Flash-Lite" },
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
            <p className="header-copy">
              Answers are generated from fresh board snapshots and must disclose exclusions, caveats, and masked-value handling.
            </p>
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
