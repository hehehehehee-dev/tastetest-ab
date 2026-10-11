import React, { useEffect, useState } from "react";
import { benchmarkApi, BranchTable } from "./Benchmark.jsx";
import { usePageSignal } from "./PageSignal.jsx";
const labels = { llm: "LLM-only", qloo: "Qloo", agent: "Agent" };
const ownerKey = (id) => `tastetest-music-proxy-owner-${id}`;
export const musicHonesty =
  "Artist names may be familiar to models. Segment listen counts were computed from raw listening data and are not published per segment.";
function Counts({ value }) {
  return (
    <p>
      {Object.entries(value.decisionCounts || value.counts)
        .map(([key, count]) => `${labels[key]} ${count.correct}/${count.total}`)
        .join(" · ")}
      {value.decisionCounts && (
        <>
          <br />
          Abstentions:{" "}
          {Object.entries(value.decisionCounts)
            .map(([key, c]) => `${labels[key]} ${c.abstained}/${c.cases}`)
            .join(" · ")}
        </>
      )}
    </p>
  );
}
export function MusicSection({ browseOpen = false }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [runs, setRuns] = useState([]);
  useEffect(() => {
    let active = true;
    benchmarkApi("/music-proxy")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => setError(e.message));
    let ids = [];
    try {
      ids = JSON.parse(
        localStorage.getItem("tastetest-music-proxy-runs") || "[]",
      );
    } catch {}
    Promise.all(
      ids.map((id) =>
        benchmarkApi(`/music-proxy/runs/${id}`, {
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
    <section className="panel music-proxy-section">
      <div className="eyebrow">SEPARATE RETROSPECTIVE PROXY / NOT TRACK B</div>
      <h2>Proxy — music · real preference data</h2>
      <p>Proxy benchmark — real preference data</p>
      <p>
        Predict which artist a taste-defined segment listened to more. These are
        historical preferences, not business results, live A/B outcomes or a
        causal experiment. Proxy results never enter Track B totals.
      </p>
      <p>{musicHonesty}</p>
      <p>
        Case selection requires a mean-listening gap, so these are filtered,
        correlated cases with missing listening records. Counts describe this
        case set only.
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
            <p>
              Scoring methods in these counts: {data.tally.methods.join(" · ")}.
              Counts across different methods do not establish the accuracy of
              one method.
            </p>
          )}
          <p>
            {data.cases.length} cases ·{" "}
            {data.manifest?.dataset || "dataset not generated"} ·{" "}
            {data.manifest?.rules.minOverallListeners || 200} minimum overall
            listeners/candidate.
          </p>
          <h3>
            Music proxy · real Qloo · {data.tally.real.cases} completed cases
          </h3>
          <Counts value={data.tally.real} />
          <h3>
            Music proxy · mock workflow · {data.tally.mock.cases} completed
            cases
          </h3>
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
            {data.cases.map((input) => (
              <div key={input.id} className="proxy-case-entry">
                <a href={`/benchmark/music/${input.id}`}>
                  {input.id} · {input.options.map((m) => m.name).join(" vs. ")}
                </a>
                <p>Seeds: {input.seeds.map((m) => m.name).join(" · ")}</p>
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
              <a href={`/benchmark/music/run/${run.id}`}>
                {run.proxyCaseId} · {run.lifecycle} · {run.mode}
              </a>
            </p>
          ))}
        </>
      )}
      <footer className="proxy-credit">
        <p>
          Last.fm / HetRec 2011, Universidad Autónoma de Madrid; distributed by
          GroupLens. Non-commercial use under dataset terms.
        </p>
        <a
          href="https://grouplens.org/datasets/hetrec-2011/"
          target="_blank"
          rel="noreferrer"
        >
          GroupLens / HetRec source & terms ↗
        </a>
        <p>
          Music protocol v2: top 20% per user, ≥30 segment users, ≥20 candidate
          listeners in segment, ≥200 overall listeners, ≥20% relative mean gap.
          One case per seed triple; audience segments may overlap. Missing
          records contribute zero observed listens, not evidence of dislike.
          Proxy results never enter Track B or film totals.
        </p>
      </footer>
    </section>
  );
}
export default function MusicCase({ caseId, runId }) {
  const [catalog, setCatalog] = useState(null),
    [run, setRun] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  usePageSignal(run);
  const [llm, setLlm] = useState({
      pick: "A",
      confidence: 50,
      source: "Human",
      answer: "",
    }),
    [beforeReveal, setBefore] = useState(false);
  const [llmMode, setLlmMode] = useState("manual");
  useEffect(() => {
    if (run?.llmPrediction) {
      setLlm(run.llmPrediction);
      setLlmMode("automatic");
    }
  }, [run?.llmPrediction?.recordedAt]);
  const [isOwner, setOwner] = useState(false);
  const call = (action, body) =>
    benchmarkApi(`/music-proxy/runs/${run.id}/${action}`, {
      method: "POST",
      headers: {
        "x-owner-token": localStorage.getItem(ownerKey(run.id)) || "",
      },
      body: JSON.stringify(body),
    });
  useEffect(() => {
    let active = true;
    benchmarkApi("/music-proxy")
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((e) => setError(e.message));
    if (runId) {
      const token = localStorage.getItem(ownerKey(runId));
      setOwner(!!token);
      benchmarkApi(`/music-proxy/runs/${runId}`, {
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
        const data = await benchmarkApi(
          `/music-proxy/cases/${input.id}/start`,
          {
            method: "POST",
            body: "{}",
          },
        );
        localStorage.setItem(ownerKey(data.run.id), data.ownerToken);
        let ids = [];
        try {
          ids = JSON.parse(
            localStorage.getItem("tastetest-music-proxy-runs") || "[]",
          );
        } catch {}
        localStorage.setItem(
          "tastetest-music-proxy-runs",
          JSON.stringify([...new Set([...ids, data.run.id])]),
        );
        window.location.assign(`/benchmark/music/run/${data.run.id}`);
      } else
        setRun(
          await call(
            action,
            action === "freeze"
              ? {
                  llm,
                  llmMode,
                  beforeReveal: llmMode === "automatic" ? true : beforeReveal,
                }
              : {},
          ),
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
            Freeze → reveal → score. Historical listening records predate your
            prediction; only the reveal is delayed.
          </p>
        </div>
      </div>
      <p>{musicHonesty}</p>
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
              <p key={movie.artistId}>{movie.name}</p>
            ))}
          </section>
          <div className="option-grid">
            {input.options.map((movie, i) => (
              <section className="panel" key={movie.artistId}>
                <div className="eyebrow">OPTION {i ? "B" : "A"}</div>
                <h2>{movie.name}</h2>
                <p>Artist</p>
              </section>
            ))}
          </div>
          {!run && (
            <button
              className="button primary"
              disabled={busy || !catalog?.available}
              onClick={() => act("start")}
            >
              {busy ? "Resolving artist tastes…" : "Start proxy case"}
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
                : run.scoringVersion === "qloo-candidate-affinity-v1"
                  ? "Real Qloo · direct candidate affinity."
                  : "Legacy run · local concept/tag heuristic (unchanged)."}
            </p>
            <p>{run.scoringNote}</p>
            {!run.freeze && run.proxyDecisionPolicy === "always-pick-v1" && (
              <p>
                Qloo / Agent pick:{" "}
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
                  branches={run.freeze.payload.branches}
                  result={run.result}
                />
                <p className="receipt-hash">SHA-256 {run.freeze.sha256}</p>
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
                      Last.fm listen counts or winner were sent to Qloo.
                    </p>
                  </details>
                )}
              </>
            ) : isOwner ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  act("freeze");
                }}
              >
                <h3>AI prediction</h3>
                <p>
                  Run the configured AI, or enter a prediction manually. A
                  reason is optional. Human selections are recorded as Human.
                </p>
                {catalog?.ai?.enabled && catalog.ai.configured && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy || !!run.llmPrediction}
                    onClick={() => act("ai")}
                  >
                    {busy
                      ? "Working…"
                      : run.llmPrediction
                        ? "AI prediction recorded"
                        : "Run AI automatically"}
                  </button>
                )}
                {llmMode === "automatic" && (
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => {
                      setLlmMode("manual");
                      setLlm({
                        pick: "A",
                        confidence: 50,
                        source: "Human",
                        answer: "",
                      });
                    }}
                  >
                    Use a manual prediction instead
                  </button>
                )}
                {llmMode === "automatic" && (
                  <p>
                    Recorded by{" "}
                    {run.llmPrediction.provider === "replicate"
                      ? "Replicate API"
                      : "AI API"}{" "}
                    · {llm.source} · {run.llmPrediction.recordedAt}
                  </p>
                )}
                {llmMode === "automatic" ? (
                  <div className="ai-api-summary" role="status">
                    <p>
                      <strong>
                        AI pick: {llm.pick === "TIE" ? "Abstain" : llm.pick}
                      </strong>{" "}
                      · Confidence {llm.confidence}/100
                    </p>
                    <p>
                      No manual input needed. The server will seal this API
                      response with Qloo before revealing the outcome.
                    </p>
                  </div>
                ) : (
                  <>
                    <fieldset disabled={busy}>
                      <label>
                        LLM pick
                        <select
                          aria-label="LLM pick"
                          value={llm.pick}
                          onChange={(e) => update("pick", e.target.value)}
                        >
                          <option>A</option>
                          <option>B</option>
                          <option value="TIE">Abstain / too close</option>
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
                        Paste original LLM answer (optional)
                        <textarea
                          maxLength={6000}
                          rows={4}
                          value={llm.answer}
                          onChange={(e) => update("answer", e.target.value)}
                        />
                      </label>
                    </fieldset>
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
                  </>
                )}
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
              <p>
                {run.outcome.segmentUsers} users had all three seeds in their
                top 20% of observed listening.
              </p>
              {run.outcome.options.map((option, i) => (
                <p key={option.artistId}>
                  Option {i ? "B" : "A"}: mean {option.mean.toFixed(3)} observed
                  listens per segment user; {option.count} segment listeners ·{" "}
                  {option.overallListeners} overall listeners.
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
