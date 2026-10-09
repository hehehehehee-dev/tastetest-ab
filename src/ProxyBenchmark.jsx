import React, { useEffect, useState } from "react";
import { benchmarkApi, BranchTable } from "./Benchmark.jsx";
const labels = { llm: "LLM-only", qloo: "Qloo", agent: "Agent" };
const ownerKey = (id) => `tastetest-proxy-owner-${id}`;
export const proxyHonesty =
  "Individual titles may be familiar to language models; the segment's actual ratings — the thing being predicted — are not published per-segment and were computed from raw ratings for this benchmark.";
function Counts({ value }) {
  return (
    <p>
      {Object.entries(value.counts)
        .map(([key, count]) => `${labels[key]} ${count.correct}/${count.total}`)
        .join(" · ")}
    </p>
  );
}
export function ProxySection() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [runs, setRuns] = useState([]);
  useEffect(() => {
    let active = true;
    benchmarkApi("/proxy")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => setError(e.message));
    let ids = [];
    try {
      ids = JSON.parse(localStorage.getItem("tastetest-proxy-runs") || "[]");
    } catch {}
    Promise.all(
      ids.map((id) =>
        benchmarkApi(`/proxy/runs/${id}`, {
          headers: {
            "x-owner-token": localStorage.getItem(ownerKey(id)) || "",
          },
        }).catch(() => null),
      ),
    ).then((values) => {
      if (active) setRuns(values.filter(Boolean));
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel proxy-section">
      <div className="eyebrow">SEPARATE RETROSPECTIVE PROXY / NOT TRACK B</div>
      <h2>Proxy benchmark — real preference data</h2>
      <p>
        Predict which movie a taste-defined segment rated more highly. These are
        historical preferences, not business results, live A/B outcomes or a
        causal experiment. Proxy results never enter Track B totals.
      </p>
      <p>{proxyHonesty}</p>
      <p>
        Case selection requires a mean-rating gap, so these are filtered,
        correlated cases with missing ratings. Counts describe this case set
        only.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {data.cases.length} cases ·{" "}
            {data.manifest?.dataset || "dataset not generated"} ·{" "}
            {data.manifest?.rules.minOverallRatings || 500} minimum overall
            ratings/candidate.
          </p>
          <h3>Real Qloo proxy · {data.tally.real.cases} completed cases</h3>
          <Counts value={data.tally.real} />
          <h3>Mock proxy workflow · {data.tally.mock.cases} completed cases</h3>
          <Counts value={data.tally.mock} />
          <p>
            Mock counts validate the workflow only; they do not measure Qloo
            accuracy. First completed freeze per case and mode counts; all
            attempts are retained.
          </p>
          {!data.available && (
            <p role="status">
              Cases cannot run until the administrator seeds the private
              outcomes.
            </p>
          )}
          <details className="proxy-case-list">
            <summary>Browse {data.cases.length} proxy cases</summary>
            {data.cases.map((input) => (
              <div key={input.id} className="proxy-case-entry">
                <a href={`/benchmark/proxy/${input.id}`}>
                  {input.id} ·{" "}
                  {input.options
                    .map((m) => `${m.title} (${m.year})`)
                    .join(" vs. ")}
                </a>
                <p>Seeds: {input.seeds.map((m) => m.title).join(" · ")}</p>
              </div>
            ))}
          </details>
        </>
      )}
      {runs.length > 0 && (
        <>
          <h3>Your proxy runs</h3>
          {runs.map((run) => (
            <p key={run.id}>
              <a href={`/benchmark/proxy/run/${run.id}`}>
                {run.proxyCaseId} · {run.lifecycle} · {run.mode}
              </a>
            </p>
          ))}
        </>
      )}
      <footer className="proxy-credit">
        <p>
          MovieLens data © GroupLens Research, University of Minnesota.
          Research/education use under the dataset's terms; no endorsement or
          commercial-use permission is implied.
        </p>
        <a
          href="https://grouplens.org/datasets/movielens/"
          target="_blank"
          rel="noreferrer"
        >
          Dataset source & terms ↗
        </a>
        <p>
          Harper & Konstan (2015),{" "}
          <a
            href="https://doi.org/10.1145/2827872"
            target="_blank"
            rel="noreferrer"
          >
            The MovieLens Datasets: History and Context
          </a>
          .
        </p>
      </footer>
    </section>
  );
}
export default function ProxyCase({ caseId, runId }) {
  const [catalog, setCatalog] = useState(null),
    [run, setRun] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [llm, setLlm] = useState({
      pick: "A",
      confidence: 50,
      source: "",
      answer: "",
    }),
    [beforeReveal, setBefore] = useState(false);
  const [isOwner, setOwner] = useState(false);
  const call = (action, body) =>
    benchmarkApi(`/proxy/runs/${run.id}/${action}`, {
      method: "POST",
      headers: {
        "x-owner-token": localStorage.getItem(ownerKey(run.id)) || "",
      },
      body: JSON.stringify(body),
    });
  useEffect(() => {
    let active = true;
    benchmarkApi("/proxy")
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((e) => setError(e.message));
    if (runId) {
      const token = localStorage.getItem(ownerKey(runId));
      setOwner(!!token);
      benchmarkApi(`/proxy/runs/${runId}`, {
        headers: { "x-owner-token": token || "" },
      })
        .then((value) => {
          if (active) setRun(value);
        })
        .catch((e) => setError(e.message));
    }
    return () => {
      active = false;
    };
  }, [caseId, runId]);
  const input = run?.input || catalog?.cases.find((c) => c.id === caseId);
  async function act(action) {
    setBusy(true);
    setError("");
    try {
      if (action === "start") {
        const data = await benchmarkApi(`/proxy/cases/${input.id}/start`, {
          method: "POST",
          body: "{}",
        });
        localStorage.setItem(ownerKey(data.run.id), data.ownerToken);
        let ids = [];
        try {
          ids = JSON.parse(
            localStorage.getItem("tastetest-proxy-runs") || "[]",
          );
        } catch {}
        localStorage.setItem(
          "tastetest-proxy-runs",
          JSON.stringify([...new Set([...ids, data.run.id])]),
        );
        window.location.assign(`/benchmark/proxy/run/${data.run.id}`);
      } else
        setRun(
          await call(action, action === "freeze" ? { llm, beforeReveal } : {}),
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const update = (field, value) =>
    setLlm((old) => ({ ...old, [field]: value }));
  return (
    <main className="container benchmark-page proxy-case-page">
      <a href="/benchmark">← Back to benchmark</a>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PROXY BENCHMARK / RETROSPECTIVE PREFERENCES
          </div>
          <h1>{input?.id || "Loading proxy case…"}</h1>
          <p>
            Freeze → reveal → score. Historical ratings predate your prediction;
            only the reveal is delayed.
          </p>
        </div>
      </div>
      <p>{proxyHonesty}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {input && (
        <>
          <section className="panel">
            <h2>Taste-defined audience</h2>
            <p>{input.audienceDefinition}</p>
            {input.seeds.map((movie) => (
              <p key={movie.movieId}>
                {movie.title} ({movie.year}) · {movie.genres.join(" / ")}
              </p>
            ))}
          </section>
          <div className="option-grid">
            {input.options.map((movie, i) => (
              <section className="panel" key={movie.movieId}>
                <div className="eyebrow">OPTION {i ? "B" : "A"}</div>
                <h2>
                  {movie.title} ({movie.year})
                </h2>
                <p>{movie.genres.join(" / ")}</p>
              </section>
            ))}
          </div>
          {!run && (
            <button
              className="button primary"
              disabled={busy || !catalog?.available}
              onClick={() => act("start")}
            >
              {busy ? "Resolving movie tastes…" : "Start proxy case"}
            </button>
          )}
        </>
      )}
      {run && (
        <>
          <section className="panel">
            <h2>
              {run.freeze
                ? `Frozen at ${run.frozenAt}`
                : "Record the independent prediction"}
            </h2>
            <p>
              {run.mode === "mock"
                ? "Mock scoring — synthetic Qloo-style signals, workflow only."
                : "Real Qloo signals · local concept/tag heuristic."}
            </p>
            <p>{run.scoringNote}</p>
            {run.freeze ? (
              <>
                <BranchTable
                  branches={run.freeze.payload.branches}
                  result={run.result}
                />
                <p className="receipt-hash">SHA-256 {run.freeze.sha256}</p>
                <p>{run.freeze.payload.timing}</p>
              </>
            ) : isOwner ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  act("freeze");
                }}
              >
                <h3>LLM-only (manual paste)</h3>
                <label>
                  LLM pick
                  <select
                    aria-label="LLM pick"
                    value={llm.pick}
                    onChange={(e) => update("pick", e.target.value)}
                  >
                    <option>A</option>
                    <option>B</option>
                  </select>
                </label>
                <label>
                  LLM confidence (0–100)
                  <input
                    type="number"
                    required
                    min="0"
                    max="100"
                    value={llm.confidence}
                    onChange={(e) =>
                      update("confidence", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Exact model/version or human
                  <input
                    required
                    value={llm.source}
                    maxLength={160}
                    onChange={(e) => update("source", e.target.value)}
                  />
                </label>
                <label>
                  Paste original LLM answer
                  <textarea
                    required
                    minLength={10}
                    maxLength={6000}
                    rows={4}
                    value={llm.answer}
                    onChange={(e) => update("answer", e.target.value)}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    required
                    checked={beforeReveal}
                    onChange={(e) => setBefore(e.target.checked)}
                  />
                  I have not viewed this segment's outcome before recording
                  these predictions.
                </label>
                <button className="button primary" disabled={busy}>
                  Freeze proxy predictions
                </button>
              </form>
            ) : (
              <p>
                Open this run in its creating browser to record or reveal
                predictions.
              </p>
            )}
            {run.freeze && !run.result && isOwner && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => act("reveal")}
              >
                Reveal proxy outcome
              </button>
            )}
          </section>
          {run.result && (
            <section className="panel proxy-outcome">
              <div className="eyebrow">
                REVEALED / HISTORICAL PREFERENCE OUTCOME
              </div>
              <h2>Segment winner: Option {run.outcome.actual}</h2>
              <p>{run.outcome.segmentUsers} users liked all three seeds.</p>
              {run.outcome.options.map((option, i) => (
                <p key={option.movieId}>
                  Option {i ? "B" : "A"}: mean {option.mean.toFixed(3)}/5 from{" "}
                  {option.count} segment ratings · {option.overallRatings}{" "}
                  overall ratings.
                </p>
              ))}
              <p>
                This proxy does not establish business results or causal
                effects. It never contributes to Track B.
              </p>
              <a href="/benchmark">View separate proxy tally ↗</a>
            </section>
          )}
        </>
      )}
    </main>
  );
}
