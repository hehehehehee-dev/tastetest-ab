import React, { useState } from "react";

export default function CaseStudy() {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function commit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/cookie-cats/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReceipt(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(receipt, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `cookie-cats-${receipt.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="container case-study">
      <div className="eyebrow">HISTORICAL CASE / WORKFLOW REHEARSAL</div>
      <h1>
        Commit first.
        <br />
        Reveal second.
      </h1>
      <p>
        Cookie Cats tests the procedure: blind brief → committed answer →
        observed result → score. It does not measure whether ordinary AI or Qloo
        is better.
      </p>
      <section className="panel case-panel">
        <h2>The blind brief</h2>
        <p>
          A mobile puzzle game pauses progression at its first gate. Predict
          which placement has higher seven-day retention.
        </p>
        <div className="case-options">
          <div>
            <span className="eyebrow">OPTION A</span>
            <h3>Gate at level 30</h3>
          </div>
          <div>
            <span className="eyebrow">OPTION B</span>
            <h3>Gate at level 40</h3>
          </div>
        </div>
        <p className="poll-footnote">
          Illustrative hypothesis / giả thuyết minh họa: a later gate might
          interrupt play less. The dataset does not establish that mechanism.
        </p>
        {!receipt ? (
          <form onSubmit={commit} className="case-form">
            <label>
              Model or source
              <input
                name="model"
                required
                maxLength={100}
                placeholder="Exact model/version, or human hypothesis"
              />
            </label>
            <label>
              Committed answer
              <select name="choice" required defaultValue="">
                <option value="" disabled>
                  Choose A or B
                </option>
                <option value="A">A · Level 30</option>
                <option value="B">B · Level 40</option>
              </select>
            </label>
            <label>
              Original rationale
              <textarea
                name="rationale"
                required
                maxLength={2000}
                placeholder="Paste the answer obtained before revealing results. No AI is called by this page."
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy ? "Committing…" : "Commit answer & reveal"}
            </button>
          </form>
        ) : (
          <section aria-live="polite">
            <div className="eyebrow">COMMITTED {receipt.committedAt}</div>
            <h2>
              {receipt.correct
                ? "The choice matches the observed winner."
                : "The choice differs from the observed winner."}
            </h2>
            <p>
              {receipt.model} chose {receipt.choice}. Observed winner: A.
            </p>
            <div className="case-options">
              {receipt.result.groups.map((g) => (
                <div key={g.option}>
                  <span className="eyebrow">
                    {g.option} · {g.players.toLocaleString()} PLAYERS
                  </span>
                  <h3>{((100 * g.day7) / g.players).toFixed(2)}%</h3>
                  <p>{g.day7.toLocaleString()} returned on day 7</p>
                </div>
              ))}
            </div>
            <p>
              B − A: −0.82 percentage points; approximate 95% interval −1.33 to
              −0.31; two-sided z-test p ≈ 0.0016.
            </p>
            <button className="button subtle" onClick={download}>
              Download commitment receipt
            </button>
            <p>
              <a href={receipt.result.source} target="_blank" rel="noreferrer">
                Dataset source
              </a>
            </p>
          </section>
        )}
      </section>
      <section className="panel case-panel">
        <h2>What this proves</h2>
        <p>
          Only that the commit → reveal → score workflow works. This famous
          public case may already be in a model’s training data. The CSV
          contains no AI predictions; one case, or four cases, cannot establish
          model superiority. Results remain publicly discoverable, so this is
          procedural blinding only.
        </p>
        <h2>The prospective study</h2>
        <p>
          A private pack of 25 draft taste-based cases is prepared. Resolve real
          Qloo entities, obtain both real predictions, freeze them before
          polling, then collect matched-audience responses. No results have been
          collected and the app’s mock scores do not count as Qloo evidence.
        </p>
      </section>
    </main>
  );
}
