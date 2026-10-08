import React, { useEffect, useState } from "react";
const sources = ["LLM only", "Qloo", "TasteTest agent", "Human"];
const storageKey = "tastetest-historical-case-01";
export default function CaseStudy() {
  const [receipt, setReceipt] = useState(null),
    [credentials, setCredentials] = useState(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true),
    [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (saved) {
          if (active) setCredentials(saved);
          const r = await fetch(`/api/historical-case/${saved.id}`, {
            headers: { "x-commit-token": saved.token },
          });
          const data = await r.json();
          if (!r.ok) throw Error(data.error);
          if (active) {
            setCredentials(saved);
            setReceipt(data);
          }
        }
      } catch (e) {
        if (active) setError(`Cannot restore the locked receipt: ${e.message}`);
      } finally {
        if (active) setRestoring(false);
      }
    }
    restore();
    return () => {
      active = false;
    };
  }, []);
  async function commit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/historical-case/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, confidence: Number(form.confidence) }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      const saved = { id: data.id, token: data.token };
      setCredentials(saved);
      setReceipt(data);
      try {
        localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {
        setError(
          "Answer locked. Browser storage unavailable; download the receipt before leaving.",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reveal() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/historical-case/${credentials.id}/reveal`,
        { method: "POST", headers: { "x-commit-token": credentials.token } },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setReceipt(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const { token, ...exported } = receipt;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exported, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `historical-case-01-${receipt.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }
  const step = receipt?.result ? 3 : receipt ? 2 : 1;
  return (
    <main className="container case-study">
      <div className="eyebrow">BENCHMARK LAB / WORKFLOW REHEARSAL</div>
      <h1>
        {receipt?.result ? "Cookie Cats · the result" : "Historical case 01"}
      </h1>
      <nav className="benchmark-progress" aria-label="Benchmark progress">
        {["Commit", "Reveal", "Score"].map((label, i) => (
          <span
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={step === i + 1 ? "active" : ""}
          >
            {i + 1} {label}
            {i < 2 ? " →" : ""}
          </span>
        ))}
      </nav>
      <section className="panel case-panel">
        <h2>The blind brief</h2>
        <p>
          A mobile puzzle game pauses progression at its first gate. Predict
          which placement has higher seven-day retention.
        </p>
        <p className="case-hypothesis">
          Illustrative hypothesis / giả thuyết minh họa: a later gate might
          interrupt play less. The dataset does not establish that mechanism.
        </p>
        {restoring ? (
          <p role="status">Checking for a locked commitment…</p>
        ) : credentials && !receipt ? (
          <p>
            Saved commitment could not be loaded. Reload to retry; editing
            remains locked.
          </p>
        ) : (
          <form onSubmit={commit} className="case-form">
            <fieldset disabled={!!receipt || busy} key={receipt?.id || "draft"}>
              <legend>Choose your prediction</legend>
              <div className="case-options">
                {["A", "B"].map((choice, i) => (
                  <label
                    key={choice}
                    className={`case-option ${receipt?.choice === choice ? "locked-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="choice"
                      value={choice}
                      required
                      defaultChecked={receipt?.choice === choice}
                    />
                    <span>
                      <span className="eyebrow">OPTION {choice}</span>
                      <strong>Gate at level {i ? 40 : 30}</strong>
                    </span>
                  </label>
                ))}
              </div>
              <fieldset className="source-selector">
                <legend>Prediction source</legend>
                {sources.map((source) => (
                  <label key={source}>
                    <input
                      type="radio"
                      name="source"
                      value={source}
                      defaultChecked={
                        (receipt?.source || "LLM only") === source
                      }
                    />
                    <span>{source}</span>
                  </label>
                ))}
              </fieldset>
              <div className="case-input-row">
                <label>
                  Exact model + version
                  <input
                    name="model"
                    required
                    maxLength={100}
                    defaultValue={receipt?.model || ""}
                  />
                </label>
                <label>
                  Confidence (0–100%)
                  <input
                    name="confidence"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    required
                    defaultValue={receipt?.confidence ?? ""}
                  />
                </label>
              </div>
              <label>
                Rationale before commitment
                <textarea
                  name="rationale"
                  required
                  maxLength={2000}
                  defaultValue={receipt?.rationale || ""}
                />
              </label>
            </fieldset>
            {!receipt && (
              <button className="button primary" disabled={busy}>
                Commit prediction
              </button>
            )}
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {receipt && (
          <div className="commit-lock" role="status">
            Committed at {receipt.committedAt} — locked
            <br />
            <small>
              {receipt.choice} · {receipt.confidence}% confidence ·{" "}
              {receipt.source}
            </small>
          </div>
        )}
        {receipt && !receipt.result && (
          <button className="button primary" onClick={reveal} disabled={busy}>
            Reveal observed result
          </button>
        )}
        {receipt?.result && (
          <section className="case-result" aria-live="polite">
            <div className="eyebrow">03 / SCORE</div>
            <h2>
              <span
                className={`match-badge ${receipt.correct ? "match" : "miss"}`}
              >
                {receipt.correct ? "MATCH" : "MISS"}
              </span>{" "}
              Observed winner: A
            </h2>
            <p className="memorized-tag">
              Possibly memorized — famous public case
            </p>
            <p>
              Day-7 retention · n ={" "}
              {receipt.result.rows.toLocaleString("en-US")}
            </p>
            <div className="case-options">
              {receipt.result.groups.map((g) => (
                <div className="observed-group" key={g.option}>
                  <span className="eyebrow">
                    gate_{g.gate} · {g.players.toLocaleString("en-US")} players
                  </span>
                  <h3>{((100 * g.day7) / g.players).toFixed(2)}%</h3>
                  <p>{g.day7.toLocaleString("en-US")} returned on day 7</p>
                </div>
              ))}
            </div>
            <p>
              B − A: −0.82 percentage points; approximate 95% interval −1.33 to
              −0.31; two-sided z-test p ≈ 0.0016.
            </p>
            <a href={receipt.result.source} target="_blank" rel="noreferrer">
              Dataset source
            </a>
          </section>
        )}
        {receipt && (
          <div className="receipt-actions">
            <button className="button subtle" onClick={download}>
              Download commitment receipt
            </button>
            {downloaded && <span role="status">Receipt download started.</span>}
          </div>
        )}
      </section>
      <p className="evidence-note">
        Workflow rehearsal only — does not measure whether ordinary AI or Qloo
        is better.
      </p>
      <details className="panel case-panel">
        <summary>About this benchmark</summary>
        <p>
          Public historical results may be memorized or found through a lookup.
          Blinding is procedural: no name or outcome is provided in the brief,
          but the problem itself can be recognized. The CSV contains no AI
          predictions; one case or four cases cannot establish model
          superiority. No AI is called by this page; paste an answer obtained
          independently before reveal.
        </p>
        <h2>The prospective study</h2>
        <p>
          25 unpublished taste-based cases (planned). Predictions are frozen
          before polling; mock scores never count as Qloo evidence.
        </p>
      </details>
    </main>
  );
}
