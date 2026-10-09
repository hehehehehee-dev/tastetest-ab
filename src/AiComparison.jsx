import React, { useState } from "react";

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
  const result = test.verdict?.paired;
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
      <div className="section-heading">
        <div>
          <div className="eyebrow">LOCKED BEFORE VOTING</div>
          <h2>AI only vs. AI + Qloo</h2>
        </div>
        <button className="button subtle" onClick={download}>
          Download prediction receipt
        </button>
      </div>
      <p className="comparison-note">
        Provider: {payload.provider || "openai"} · Same model:{" "}
        <strong>{payload.requestedModel || payload.model}</strong> · Same
        concepts, audience and instructions. Only the Qloo context changes. Text
        descriptions only; images are not evaluated.
      </p>
      <div className="option-grid">
        {[
          ["aiOnly", "AI only", "Concepts + audience tastes"],
          ["aiQloo", "AI + Qloo", "Same input + real Qloo tags and affinities"],
        ].map(([key, title, description]) => (
          <article className="panel ai-choice" key={key}>
            <span className="eyebrow">{description}</span>
            <h3>{title}</h3>
            <div className="ai-pick">
              {payload[key].choice === "TIE"
                ? "No clear pick"
                : `Option ${payload[key].choice}`}
            </div>
            <p>{payload[key].rationale}</p>
            <p className="muted">
              Self-reported confidence: {payload[key].confidence}/100 · Not
              calibrated.
            </p>
            <span className="ai-grade">
              {result ? result[key] : "LOCKED · Awaiting audience votes"}
            </span>
          </article>
        ))}
      </div>
      {result && (
        <div className="panel paired-result">
          <h3>Locked choices / audience result</h3>
          <div className="paired-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>AI only</th>
                  <th>AI + Qloo</th>
                  <th>Audience</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{payload.aiOnly.choice}</td>
                  <td>{payload.aiQloo.choice}</td>
                  <td>
                    {result.actual || "No winner"} · {result.total} votes
                  </td>
                </tr>
                <tr>
                  <td>{result.aiOnly}</td>
                  <td>{result.aiQloo}</td>
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
            {payload.aiOnly.versionVerification}{" "}
            {payload.aiQloo.versionVerification}
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
