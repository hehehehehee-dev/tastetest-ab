import React, { useState } from "react";
import QlooEvidence from "./QlooEvidence.jsx";
import PredictionStepFeed from "./PredictionStepFeed.jsx";

function QlooSeparation({ branch }) {
  const direct = branch.method === "direct-entity-affinity";
  const recordedAffinities = branch.affinities;
  const gap = Number.isFinite(branch.scoreGap)
    ? branch.scoreGap
    : direct &&
        recordedAffinities?.length === 2 &&
        recordedAffinities.every((item) => Number.isFinite(item.affinity))
      ? Math.abs(
          recordedAffinities[0].affinity - recordedAffinities[1].affinity,
        ) * 100
      : null;
  if (gap === null)
    return (
      <p className="muted qloo-separation-summary">
        Score gap was not recorded in this receipt. The legacy separation rating
        was assigned by TasteTest, not reported by Qloo.
      </p>
    );
  const value = direct ? gap / 100 : gap;
  const decimals = direct ? 6 : 3;
  const displayed =
    value > 0 && value < 10 ** -decimals
      ? `<${(10 ** -decimals).toFixed(decimals)}`
      : value.toFixed(decimals);
  return (
    <p className="muted qloo-separation-summary">
      {direct ? "Affinity gap" : "Text-score gap"}: {displayed}
      {direct ? "" : " points"} ·{" "}
      {gap < 10 ? "Low" : gap < 25 ? "Moderate" : "High"} separation.
      <br />
      Calculated by TasteTest
      {direct ? " from Qloo affinity" : " from local text scores"}; not
      Qloo-reported prediction confidence.
    </p>
  );
}

export default function AiComparison({ test }) {
  const [downloaded, setDownloaded] = useState(false);
  const receipt = test.comparison;
  if (!receipt)
    return (
      <section className="panel ai-comparison">
        <h2>Predictions locked</h2>
        <p>AI predictions stay hidden from voters until the poll closes.</p>
      </section>
    );
  const { payload } = receipt;
  // Older receipts can record an abstention without setting noSignalTie.
  // Explain the recorded choice without changing that receipt or its result.
  const noSignalTie =
    payload.qloo?.noSignalTie ||
    (payload.qloo?.fallback &&
      payload.qloo.choice === "TIE" &&
      test.provenance?.qlooOptionSignal === false);
  const result = test.verdict?.paired;
  const threeBranches = !!payload.qloo;
  const branches = threeBranches
    ? [
        ["aiOnly", "AI-only", "Concepts + audience tastes"],
        [
          "qloo",
          "Qloo",
          payload.qloo.method === "direct-entity-affinity"
            ? "Direct affinity for confirmed entities"
            : "Local concept fit · declared fallback",
        ],
        ["aiQloo", "Agent", "LLM + available Qloo audience context"],
      ]
    : [
        ["aiOnly", "AI-only", "Concepts + audience tastes"],
        ["aiQloo", "AI + Qloo", "Same input + real Qloo tags and affinities"],
      ];
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              ...receipt,
              pollOpenedAt: test.pollOpenedAt,
              closedAt: test.closedAt,
              result: result || null,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `paired-prediction-${test.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }
  return (
    <section className="ai-comparison" aria-label="Paired AI comparison">
      <QlooEvidence test={test} />
      {test.predictionWork?.steps?.every((step) => step.status === "done") && (
        <PredictionStepFeed
          work={test.predictionWork}
          qlooFallback={payload.qloo?.fallback}
        />
      )}
      <div className="section-heading">
        <div>
          <div className="eyebrow">LOCKED BEFORE VOTING</div>
          <h2>
            {threeBranches ? "Three frozen branches" : "AI-only vs. AI + Qloo"}
          </h2>
        </div>
        <button className="button subtle" onClick={download}>
          Download prediction receipt
        </button>
      </div>
      <p className="comparison-note">
        AI branches: {payload.provider || "openai"} · Same model:{" "}
        <strong>{payload.requestedModel || payload.model}</strong> · Same
        concepts, audience and instructions. Only the Agent receives Qloo
        context. Text descriptions only; images are not evaluated.
      </p>
      <div className={`option-grid${threeBranches ? " three-branches" : ""}`}>
        {branches.map(([key, title, description]) => (
          <article className="panel ai-choice" key={key}>
            <span className="eyebrow">{description}</span>
            <h3>{title}</h3>
            <div className="ai-pick">
              {payload[key].choice === "TIE"
                ? "No clear pick"
                : `Option ${payload[key].choice}`}
            </div>
            <p>
              {key === "qloo" &&
              payload[key].method === "direct-entity-affinity"
                ? payload[key].choice === "TIE"
                  ? "Qloo abstained in this frozen prediction. See the receipt for the recorded decision rule."
                  : `${test.options[payload[key].choice === "A" ? 0 : 1].title} has the higher recorded affinity.`
                : payload[key].rationale}
            </p>
            {key === "qloo" && payload[key].fallback && (
              <span className="qloo-fallback-badge">
                Qloo: no data — heuristic fallback
              </span>
            )}
            {key === "qloo" &&
              payload[key].fallback &&
              test.mode === "real" &&
              test.insights?.length > 0 && (
                <p className="muted qloo-signal-explanation">
                  Qloo returned audience signals. These custom options have no
                  direct entity affinity; this branch uses local text scoring.
                  The Agent also receives the Qloo audience context.
                </p>
              )}
            {key === "qloo" ? (
              <QlooSeparation branch={payload[key]} />
            ) : (
              <p className="muted">
                Self-reported confidence: {payload[key].confidence}/100 · Not
                calibrated.
              </p>
            )}
            <span className="ai-grade">
              {result
                ? key === "aiQloo" && threeBranches
                  ? result.agent || result.aiQloo
                  : result[key]
                : "LOCKED · Awaiting audience votes"}
            </span>
          </article>
        ))}
      </div>
      {noSignalTie && (
        <div className="segment-note no-signal-note" role="status">
          <strong>
            No affinity signal for either option — prediction abstains.
          </strong>
        </div>
      )}
      {result && (
        <div className="panel paired-result">
          <h3>Locked choices / audience result</h3>
          <div className="paired-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{threeBranches ? "AI-only" : "AI-only"}</th>
                  {threeBranches && <th>Qloo</th>}
                  <th>{threeBranches ? "Agent" : "AI + Qloo"}</th>
                  <th>Audience</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{payload.aiOnly.choice}</td>
                  {threeBranches && <td>{payload.qloo.choice}</td>}
                  <td>{payload.aiQloo.choice}</td>
                  <td>
                    {result.actual || "No winner"} · {result.total} votes
                  </td>
                </tr>
                <tr>
                  <td>{result.aiOnly}</td>
                  {threeBranches && <td>{result.qloo}</td>}
                  <td>{threeBranches ? result.agent : result.aiQloo}</td>
                  <td>{result.status}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            At least {result.minVotes} votes and a non-tied poll are required
            for scoring. This is one convenience-poll case, not evidence that
            either approach is better.
          </p>
        </div>
      )}
      <details className="qloo-provenance">
        <summary>Prediction lock & methodology</summary>
        <p>
          Committed: {payload.committedAt}
          <br />
          Poll opened: {test.pollOpenedAt || "Not yet opened"}
        </p>
        <p className="receipt-hash">SHA-256: {receipt.sha256}</p>
        <p className="receipt-hash">
          Requested / recorded model: {payload.model}
        </p>
        {payload.provider === "replicate" && (
          <p>
            Returned versions: {payload.aiOnly.returnedVersion} /{" "}
            {payload.aiQloo.returnedVersion}.{" "}
            {[
              ...new Set(
                [
                  payload.aiOnly.versionVerification,
                  payload.aiQloo.versionVerification,
                ].filter(Boolean),
              ),
            ].join(" ")}
          </p>
        )}
        <p>
          The JSON receipt includes both exact prompts, response IDs and
          returned model versions. Predictions cannot be edited or rerun on this
          poll. A new attempt creates a new case; report all attempts, including
          failed or excluded cases. Model randomness can still affect the
          comparison.
        </p>
        <p>
          Plan 20–30 new cases; lock before collecting votes. Twenty evaluable
          cases is a reporting floor, not proof of superiority. Ties,
          abstentions and low-response cases remain explicit.
        </p>
      </details>
      <p className="muted" role="status">
        {downloaded
          ? "Prediction receipt downloaded. It contains no owner token or API key."
          : "Both AI calls completed before this poll was created. No audience outcome was supplied to either model."}
      </p>
    </section>
  );
}
