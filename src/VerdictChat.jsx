import React, { useMemo, useState } from "react";

const starters = [
  "Why did you pick A?",
  "Where did the branches disagree?",
  "What would change this verdict?",
  "How confident should I be?",
];

function sessionId(key) {
  const storageKey = `tastetest-verdict-chat-${key}`;
  let value = sessionStorage.getItem(storageKey);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(storageKey, value);
  }
  return value;
}

export default function VerdictChat({ endpoint, verdictKey, headers = {} }) {
  const session = useMemo(() => sessionId(verdictKey), [verdictKey]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [capped, setCapped] = useState(false);

  async function ask(value) {
    const text = value.trim();
    if (!text || busy || capped) return;
    setMessages((current) => [...current, { role: "user", text }]);
    setQuestion("");
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ sessionId: session, question: text }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not answer that yet.");
      setMessages((current) => [
        ...current,
        { role: "assistant", text: data.answer },
      ]);
      setCount(data.count);
      setCapped(data.capped === true);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: error.message || "Could not answer that yet. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel verdict-chat">
      <summary>
        <span>
          <b>Ask about this result</b>
          <small>Grounded in this frozen verdict only</small>
        </span>
        <span aria-hidden="true">↗</span>
      </summary>
      <div className="verdict-chat-body">
        <p className="verdict-chat-guardrail">
          Answers use only the frozen seeds, signals, branch records, outcome
          and receipt. They do not prove future accuracy.
        </p>
        <div className="verdict-chat-starters" aria-label="Suggested questions">
          {starters.map((starter) => (
            <button
              type="button"
              key={starter}
              disabled={busy || capped}
              onClick={() => ask(starter)}
            >
              {starter}
            </button>
          ))}
        </div>
        {messages.length > 0 && (
          <div className="verdict-chat-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div
                className={`verdict-chat-message is-${message.role}${message.error ? " is-error" : ""}`}
                key={`${message.role}-${index}`}
              >
                <span>{message.role === "user" ? "You" : "TasteTest"}</span>
                <p>{message.text}</p>
              </div>
            ))}
            {busy && (
              <div className="verdict-chat-message is-assistant is-thinking">
                <span>TasteTest</span>
                <p>Checking the frozen record…</p>
              </div>
            )}
          </div>
        )}
        <form
          className="verdict-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <label htmlFor={`verdict-question-${verdictKey}`}>
            Your question
          </label>
          <div>
            <input
              id={`verdict-question-${verdictKey}`}
              value={question}
              maxLength={500}
              disabled={busy || capped}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about the pick, signals or confidence"
            />
            <button
              type="submit"
              className="button"
              disabled={busy || capped || !question.trim()}
            >
              {busy ? "Checking…" : "Ask"}
            </button>
          </div>
        </form>
        <p className="verdict-chat-count">
          {count}/10 questions used in this browser session
        </p>
      </div>
    </details>
  );
}
