import React, { useEffect, useState } from "react";
import { ProxySection } from "./ProxyBenchmark.jsx";
export async function benchmarkApi(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Please try again.");
  return data;
}
const labels = { llm: "LLM-only (manual paste)", qloo: "Qloo", agent: "Agent" };
export function BranchTable({ branches, result }) {
  return (
    <div className="benchmark-scroll">
      <table className="benchmark-table">
        <thead>
          <tr>
            <th>Branch</th>
            <th>Pick</th>
            <th>Confidence</th>
            <th>Source</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(branches).map(([key, branch]) => (
            <tr key={key}>
              <td>{labels[key]}</td>
              <td>
                {branch.pick === "TIE" ? "Too close to call" : branch.pick}
              </td>
              <td>{branch.confidence}/100</td>
              <td>{branch.source}</td>
              <td>{result?.grades[key] || "Pending outcome"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function Benchmark() {
  const [data, setData] = useState(null),
    [drafts, setDrafts] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    benchmarkApi("/benchmark")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => setError(e.message));
    let ids = [];
    try {
      ids = JSON.parse(localStorage.getItem("tastetest-cases") || "[]");
    } catch {}
    Promise.all(
      ids.map((id) =>
        benchmarkApi(`/tests/${id}`, {
          headers: {
            "x-owner-token":
              localStorage.getItem(`tastetest-owner-${id}`) || "",
          },
        }).catch(() => null),
      ),
    ).then((rows) => {
      if (active) setDrafts(rows.filter((row) => row && !row.closedAt));
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="container benchmark-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRACK B / FRESH TASTE CASES</div>
          <h1>Evidence before claims.</h1>
          <p>
            Draft → predictions frozen → collecting → closed. Three committed
            choices, one audience outcome.
          </p>
        </div>
      </div>
      <a className="button primary" href="/benchmark/new">
        Create a new case
      </a>
      <section className="panel benchmark-summary">
        <h2>Running tally</h2>
        <p className="benchmark-tally">
          {data?.tally.message || "not enough cases yet"}
        </p>
        <p className="track-b-counts">
          {data &&
            Object.entries(data.tally.counts)
              .map(
                ([key, count]) =>
                  `${key === "llm" ? "LLM-only" : labels[key]} ${count.correct}/${count.total}`,
              )
              .join(" · ")}
        </p>
        <p>
          At least 20 eligible closed cases; at least 20 votes per case. Mock
          signals, public cases, ties and unverified audience tastes are
          excluded.
        </p>
        <p>
          {data
            ? `${data.tally.evaluableCases} eligible / ${data.tally.closedCases} recorded closed cases`
            : "Loading records…"}
          . Confidence is recorded on a 0–100 scale and is not calibrated.
        </p>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="panel">
        <h2>Your open cases</h2>
        <p className="muted">
          Owner controls are saved in the creating browser.
        </p>
        {drafts.length ? (
          drafts.map((row) => (
            <p key={row.id}>
              <a href={`/test/${row.id}?view=prediction`}>
                {row.freeze?.payload.caseLabel || row.title}
              </a>{" "}
              · {row.lifecycle}
            </p>
          ))
        ) : (
          <p>No open cases in this browser.</p>
        )}
      </section>
      <section className="panel">
        <h2>Closed case ledger</h2>
        <p>
          ✓ matched · ✗ missed · ABSTAIN: too close to call. Excluded rows
          remain visible for audit.
        </p>
        <div className="benchmark-scroll">
          <table className="benchmark-table">
            <thead>
              <tr>
                <th>Case / mode</th>
                <th>LLM-only (manual paste)</th>
                <th>Qloo</th>
                <th>Agent</th>
                <th>Votes A / B</th>
                <th>Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <a href={`/test/${row.id}`}>{row.caseLabel}</a>
                    <br />
                    {row.mode}
                  </td>
                  {["llm", "qloo", "agent"].map((key) => (
                    <td key={key}>
                      {row.branches[key].pick} {row.result.grades[key]}
                      <br />
                      Confidence {row.branches[key].confidence}/100
                    </td>
                  ))}
                  <td>
                    {row.result.votes.join(" / ")} ({row.result.total} total)
                    <br />
                    Winner: {row.result.actual || "tied / none"}
                  </td>
                  <td>
                    {row.result.eligible
                      ? "Eligible"
                      : row.result.reasons.join("; ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.rows.length && <p>No cases have closed yet.</p>}
      </section>
      <ProxySection />
      <section className="panel">
        <div className="eyebrow">WORKFLOW REHEARSAL</div>
        <h2>Public cases stay separate.</h2>
        <p>
          Famous answers may be memorized. These datasets test commit → reveal →
          score mechanics and never count as Track B accuracy.
        </p>
        <a href="/benchmark-lab/historical-case-01">
          Cookie Cats · Historical case 01 ↗
        </a>
        <p>
          <a href="/">Synthetic cafe example ↗</a>
        </p>
      </section>
    </main>
  );
}
