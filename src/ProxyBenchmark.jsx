import ProxyVerdict from "./ProxyVerdict.jsx";
import ProxyChoice from "./ProxyChoice.jsx";
import React, { useEffect, useState } from "react";
import { benchmarkApi, BranchTable } from "./Benchmark.jsx";
import { usePageSignal } from "./PageSignal.jsx";
import PredictionStepFeed from "./PredictionStepFeed.jsx";
import {
  beginPredictionStep,
  clonePredictionWork,
  createPredictionWork,
  failPredictionStep,
} from "../shared/predictionWork.mjs";
const labels = { llm: "AI-only", qloo: "Qloo" };
const ownerKey = (id) => `tastetest-proxy-owner-${id}`;
export const proxyHonesty =
  "Individual titles may be familiar to language models; the segment's actual ratings — the thing being predicted — are not published per-segment and were computed from raw ratings for this benchmark.";
function Counts({ value }) {
  return (
    <p>
      {Object.entries(value.decisionCounts || value.counts)
        .filter(([key]) => key !== "agent")
        .map(([key, count]) => `${labels[key]} ${count.correct}/${count.total}`)
        .join(" · ")}
      {value.decisionCounts && (
        <>
          <br />
          Abstentions:{" "}
          {Object.entries(value.decisionCounts)
            .filter(([key]) => key !== "agent")
            .map(([key, c]) => `${labels[key]} ${c.abstained}/${c.cases}`)
            .join(" · ")}
        </>
      )}
    </p>
  );
}
const completedLabel = (count) =>
  `${count} completed ${count === 1 ? "case" : "cases"}`;
export function ProxySection({ browseOpen = false }) {
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
      <div className="eyebrow">
        HISTORICAL PROXY / EXCLUDED FROM LIVE EVIDENCE
      </div>
      <h2>Proxy benchmark — real preference data</h2>
      <p>
        Predict which movie a taste-defined segment rated more highly. These are
        historical preferences, not business results, live A/B outcomes or a
        causal experiment. Proxy results never enter the live evidence
        benchmark (Track B).
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
            Correct / declared A-or-B picks; abstentions shown separately over
            all completed cases. Legacy locked runs retain their original
            scoring method.
          </p>
          {data.tally.methods?.length > 0 && (
            <p>{`Scoring methods in these counts: ${data.tally.methods.join(" · ")}. Counts across different methods do not establish the accuracy of one method.`}</p>
          )}
          <p>{`${data.cases.length} cases · ${data.manifest?.dataset || "dataset not generated"} · ${data.manifest?.rules.minOverallRatings || 500} minimum overall ratings/candidate.`}</p>
          <h3>Real Qloo proxy · {completedLabel(data.tally.real.cases)}</h3>
          <Counts value={data.tally.real} />
          <div className="completed-proxy-index">
            <h4>Completed real-Qloo results</h4>
            {(data.completedRuns || [])
              .filter((row) => row.mode === "real-qloo")
              .map((row) => (
                <a key={row.id} href={`/benchmark/film/run/${row.id}`}>
                  {row.caseId} · revealed · real Qloo
                </a>
              ))}
            {!(data.completedRuns || []).some(
              (row) => row.mode === "real-qloo",
            ) && <p>No real-Qloo result has been revealed yet.</p>}
          </div>
          <h3>Mock proxy workflow · {completedLabel(data.tally.mock.cases)}</h3>
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
          <details className="proxy-case-list" open={browseOpen || undefined}>
            <summary>Browse {data.cases.length} proxy cases</summary>
            {data.cases.map((input) => {
              const completed = (data.completedRuns || []).find(
                (row) => row.caseId === input.id && row.mode === "real-qloo",
              );
              return (
                <div key={input.id} className="proxy-case-entry">
                  <a
                    href={
                      completed
                        ? `/benchmark/film/run/${completed.id}`
                        : `/benchmark/film/${input.id}`
                    }
                  >
                    {input.id} ·{" "}
                    {input.options
                      .map((m) => `${m.title} (${m.year})`)
                      .join(" vs. ")}
                    {completed ? " · revealed · real Qloo" : " · start case"}
                  </a>
                  <p>Seeds: {input.seeds.map((m) => m.title).join(" · ")}</p>
                  {completed && (
                    <a
                      className="proxy-start-another"
                      href={`/benchmark/film/${input.id}`}
                    >
                      Start another run
                    </a>
                  )}
                </div>
              );
            })}
          </details>
        </>
      )}
      {runs.length > 0 && (
        <>
          <h3>Runs owned by this browser</h3>
          {runs.map((run) => (
            <p key={run.id}>
              <a href={`/benchmark/film/run/${run.id}`}>
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
    [error, setError] = useState(""),
    [predictionWork, setPredictionWork] = useState(null);
  usePageSignal(run);
  const [isOwner, setOwner] = useState(false);
  const callRun = (currentRun, action, body) =>
    benchmarkApi(`/proxy/runs/${currentRun.id}/${action}`, {
      method: "POST",
      headers: {
        "x-owner-token": localStorage.getItem(ownerKey(currentRun.id)) || "",
      },
      body: JSON.stringify(body),
    });
  const call = (action, body) => callRun(run, action, body);
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
          if (active) {
            setRun(value);
            setPredictionWork(value.predictionWork || null);
          }
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
      setRun(await call(action, {}));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function startRun() {
    const data = await benchmarkApi(`/proxy/cases/${input.id}/start`, {
      method: "POST",
      body: "{}",
    });
    localStorage.setItem(ownerKey(data.run.id), data.ownerToken);
    let ids = [];
    try {
      ids = JSON.parse(localStorage.getItem("tastetest-proxy-runs") || "[]");
    } catch {}
    localStorage.setItem(
      "tastetest-proxy-runs",
      JSON.stringify([...new Set([...ids, data.run.id])]),
    );
    window.history.replaceState({}, "", `/benchmark/film/run/${data.run.id}`);
    setOwner(true);
    setRun(data.run);
    setPredictionWork(data.run.predictionWork || null);
    return data.run;
  }
  async function complete(visitorPick) {
    setBusy(true);
    setError("");
    let activeWork = clonePredictionWork(run?.predictionWork);
    if (!activeWork) {
      activeWork = createPredictionWork({
        mode: catalog?.mode || "real",
        context: "proxy-film",
      });
      beginPredictionStep(activeWork, "resolve-seeds");
      setPredictionWork(clonePredictionWork(activeWork));
    }
    try {
      let current = run || (await startRun());
      if (!current.freeze) {
        activeWork = clonePredictionWork(current.predictionWork || activeWork);
        beginPredictionStep(activeWork, "record-branches");
        setPredictionWork(clonePredictionWork(activeWork));
        if (
          !current.llmPrediction &&
          catalog?.ai?.enabled &&
          catalog.ai.configured
        ) {
          try {
            current = await callRun(current, "ai", {});
          } catch {
            // The AI branch is optional. A provider rejection must not discard
            // the already-computed Qloo prediction or block the sealed reveal.
            // Freeze below records AI as Not run, without inventing a pick.
          }
        }
        current = await callRun(current, "freeze", {
          llmMode: current.llmPrediction ? "automatic" : "skip",
          beforeReveal: true,
          visitorPick,
        });
        setPredictionWork(current.predictionWork || activeWork);
      }
      setRun(current);
      setRun(await callRun(current, "reveal", {}));
    } catch (e) {
      setError(e.message);
      if (e.predictionWork) setPredictionWork(e.predictionWork);
      else if (activeWork) {
        const active = activeWork.steps.find(
          (step) => step.status === "active",
        );
        if (active)
          failPredictionStep(
            activeWork,
            active.id,
            active.id === "record-branches"
              ? "Couldn't record the branch predictions. Nothing was frozen."
              : "Couldn't complete this prediction stage. No result was invented.",
          );
        setPredictionWork(clonePredictionWork(activeWork));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className={`container benchmark-page proxy-case-page ${run?.result ? "has-verdict" : ""}`}
    >
      <a href="/benchmark">← Back to benchmark</a>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PROXY BENCHMARK / HISTORICAL PREFERENCES
          </div>
          <h1>{input?.id || "Loading proxy case…"}</h1>
          <p>
            Freeze → reveal → score. Historical ratings predate your prediction;
            only the reveal is delayed.
          </p>
        </div>
      </div>
      {!run?.result && <p>{proxyHonesty}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <PredictionStepFeed work={predictionWork || run?.predictionWork} />
      {input && !run?.result && (
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
            <section className="panel proxy-inline-run">
              <h2>Reveal AI, Qloo and the historical result</h2>
              <ProxyChoice
                options={input.options}
                busy={busy || !catalog?.available}
                hasAi={false}
                aiAvailable={!!(catalog?.ai?.enabled && catalog.ai.configured)}
                onComplete={complete}
              />
              {!catalog?.available && (
                <p role="status">This case is not available yet.</p>
              )}
            </section>
          )}
        </>
      )}
      {run && (
        <>
          {run.result && <ProxyVerdict run={run} canChat={isOwner} />}
          <section className="panel">
            <h2>
              {run.result
                ? "Comparison results"
                : run.freeze
                  ? `Frozen at ${run.frozenAt}`
                  : "Record the independent prediction"}
            </h2>
            <p>
              {run.mode === "mock"
                ? "Mock scoring — synthetic Qloo-style signals, workflow only."
                : run.scoringVersion === "qloo-candidate-affinity-v1"
                  ? "Real Qloo · direct candidate affinity."
                  : "Legacy run · local concept/tag heuristic (unchanged)."}
            </p>
            {!run.result && (
              <p>
                {run.scoringNote
                  ?.replaceAll(
                    "Qloo and Agent use the same direct candidate affinity, not independent predictors.",
                    "Qloo uses direct candidate affinity.",
                  )
                  .replaceAll(
                    "Qloo and Agent share one mock predictor.",
                    "Qloo uses a mock predictor.",
                  )
                  .replaceAll("Qloo/Agent", "Qloo")}
              </p>
            )}
            {!run.freeze && run.proxyDecisionPolicy === "always-pick-v1" && (
              <p>
                Qloo pick:{" "}
                <strong>
                  {run.prediction[0].score >= run.prediction[1].score
                    ? "A"
                    : "B"}
                </strong>
                {Math.abs(run.prediction[0].score - run.prediction[1].score) <
                10
                  ? " · low separation"
                  : ""}
                . Higher score wins; exact ties choose A.
              </p>
            )}
            {run.freeze ? (
              <>
                <BranchTable
                  proxy
                  branches={run.freeze.payload.branches}
                  result={run.result}
                />
                {run.freeze.payload.visitorPick && (
                  <p>
                    Your guess: {run.freeze.payload.visitorPick}
                    {run.result
                      ? run.freeze.payload.visitorPick === run.result.actual
                        ? " · matched"
                        : " · missed"
                      : ""}
                  </p>
                )}
                <details>
                  <summary>Freeze receipt</summary>
                  <p>Frozen at {run.freeze.payload.frozenAt || run.frozenAt}</p>
                  <p className="receipt-hash">SHA-256 {run.freeze.sha256}</p>
                  {Object.entries(run.freeze.payload.branches)
                    .filter(([key]) => key !== "agent")
                    .map(([key, branch]) => (
                      <p className="receipt-hash" key={key}>
                        {key === "llm" ? "AI-only" : "Qloo"} · full source:{" "}
                        {branch.source}
                      </p>
                    ))}
                </details>
                <p>{run.freeze.payload.timing}</p>
                {run.freeze.payload.provenance?.source === "Qloo API" && (
                  <details className="qloo-proof">
                    <summary>Qloo evidence & score calculation</summary>
                    <p>
                      Fetched: {run.freeze.payload.provenance.fetchedAt} · GET{" "}
                      {run.freeze.payload.provenance.endpoint}
                    </p>
                    <p>{run.freeze.payload.provenance.mapping}</p>
                    <p>
                      signal.interests.entities:{" "}
                      {run.freeze.payload.provenance.seedEntityIds.join(", ")}
                    </p>
                    <p>
                      filter.results.entities:{" "}
                      {run.freeze.payload.provenance.candidateEntityIds.join(
                        ", ",
                      )}
                    </p>
                    {run.freeze.payload.provenance.affinities.map((e, i) => (
                      <p key={e.entityId}>
                        Option {i ? "B" : "A"}: {e.name} · affinity{" "}
                        {e.affinity.toFixed(6)} ×100 ={" "}
                        {(e.affinity * 100).toFixed(3)} fit points · ID{" "}
                        {e.entityId}
                      </p>
                    ))}
                    <p>
                      Evidence is included in the frozen receipt hash. No
                      MovieLens ratings or winner were sent to Qloo.
                    </p>
                  </details>
                )}
              </>
            ) : isOwner ? (
              <ProxyChoice
                options={run.options}
                busy={busy}
                hasAi={!!run.llmPrediction}
                aiAvailable={!!(catalog?.ai?.enabled && catalog.ai.configured)}
                onComplete={complete}
              />
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
        </>
      )}
    </main>
  );
}
