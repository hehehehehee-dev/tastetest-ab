import React, { useState } from "react";
import CaseNavigation from "./CaseNavigation.jsx";

export default function CaseStudy() {
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reveal() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/historical-case/reveal", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not reveal the case.");
      setRevealed(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const result = revealed?.result;
  return (
    <main className="container case-study">
      <div className="eyebrow">BENCHMARK LAB / HISTORICAL CASE STUDY</div>
      <h1>{result ? "Cookie Cats · the result" : "Historical case 01"}</h1>
      <CaseNavigation />
      <section className="panel case-panel">
        <h2>The decision</h2>
        <p>
          A mobile puzzle game pauses progression at its first gate. Which
          placement had higher seven-day retention?
        </p>
        <div className="case-options">
          <div className="case-option">
            <span>
              <span className="eyebrow">OPTION A</span>
              <strong>Gate at level 30</strong>
            </span>
          </div>
          <div className="case-option">
            <span>
              <span className="eyebrow">OPTION B</span>
              <strong>Gate at level 40</strong>
            </span>
          </div>
        </div>
        <p className="case-hypothesis">
          Illustrative hypothesis / giả thuyết minh họa: a later gate might
          interrupt play less. The dataset does not establish that mechanism.
        </p>
        <p>
          No prediction entry is needed. Reveal shows the observed data and
          whether recorded AI or Qloo predictions are available.
        </p>
        {!result && (
          <button
            className="button primary"
            style={{ minHeight: 44 }}
            onClick={reveal}
            disabled={busy}
          >
            {busy ? "Revealing…" : "Reveal observed result"}
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <section className="case-result" aria-live="polite">
            <h2>
              Observed winner: {result.actual} · gate at level{" "}
              {result.groups.find((g) => g.option === result.actual).gate}
            </h2>
            <div className="historical-comparison">
              <table>
                <caption>AI / Qloo / observed data</caption>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Choice</th>
                    <th scope="col">Record</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">AI (LLM-only)</th>
                    <td>{revealed.branches.llm.pick || "Not recorded"}</td>
                    <td>{revealed.branches.llm.note}</td>
                  </tr>
                  <tr>
                    <th scope="row">Qloo</th>
                    <td>{revealed.branches.qloo.pick || "Not available"}</td>
                    <td>{revealed.branches.qloo.note}</td>
                  </tr>
                  <tr>
                    <th scope="row">Observed data</th>
                    <td>
                      {result.actual} · gate at level{" "}
                      {
                        result.groups.find((g) => g.option === result.actual)
                          .gate
                      }
                    </td>
                    <td>
                      Seven-day retention across{" "}
                      {result.rows.toLocaleString("en-US")} players.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="memorized-tag">
              Possibly memorized — famous public case
            </p>
            <div className="case-options">
              {result.groups.map((g) => (
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
            <a href={result.source} target="_blank" rel="noreferrer">
              Dataset source
            </a>
          </section>
        )}
      </section>
      <p className="evidence-note">
        Historical case study only — excluded from all benchmark accuracy
        tallies. This case does not measure whether ordinary AI or Qloo is
        better.
      </p>
      <details className="panel case-panel">
        <summary>About this case study</summary>
        <p>
          The CSV contains player outcomes, not AI or Qloo predictions. Missing
          predictions are shown explicitly, never reconstructed after seeing the
          answer. Public historical results may be memorized or found through a
          lookup.
        </p>
        <p>
          For a measured comparison, use the film or music proxy, or a fresh
          Track B case. Those flows retain prediction freezing before reveal or
          polling.
        </p>
      </details>
    </main>
  );
}
