import React from "react";
import { recordedQlooEvidence, seedExplanations } from "./qlooEvidence.mjs";

export default function QlooEvidence({ test }) {
  if (test.mode !== "real") return null;
  const direct =
    test.comparison?.payload?.qloo?.method === "direct-entity-affinity";
  const evidence = recordedQlooEvidence(test);
  const profile = evidence?.tasteProfile;
  const tags = (
    profile?.mode === "real" &&
    profile.status === "available" &&
    Array.isArray(profile.tags)
      ? profile.tags
      : []
  )
    .filter(
      (tag) =>
        typeof tag?.name === "string" &&
        tag.name.trim() &&
        Number.isFinite(tag.affinity) &&
        tag.affinity >= 0 &&
        tag.affinity <= 1,
    )
    .slice(0, 5);
  const explanations = seedExplanations(
    evidence,
    direct ? test.comparison.payload.qloo.affinities : [],
  );
  const signals = (
    direct ? test.comparison.payload.qloo.affinities || [] : test.insights || []
  ).filter((signal) => signal.name && Number.isFinite(signal.affinity));
  if (!signals.length && !tags.length) return null;
  const roundedTie =
    direct &&
    signals.length === 2 &&
    signals[0].affinity !== signals[1].affinity &&
    signals[0].affinity.toFixed(3) === signals[1].affinity.toFixed(3);
  return (
    <section className="panel qloo-evidence" aria-label="Qloo evidence">
      <div className="eyebrow">QLOO · REAL API DATA</div>
      <h2>
        {direct
          ? "Direct A/B affinity received"
          : "Qloo audience signals received"}
      </h2>
      <p>
        {direct
          ? "These affinities are for the confirmed option entities. They are not vote probabilities."
          : "Qloo found related tastes for this audience. The Agent uses this context; custom ideas are evaluated with text reasoning, not direct entity affinity."}
      </p>
      <div className="qloo-evidence-signals">
        {signals.slice(0, 3).map((signal, index) => (
          <div key={signal.entityId || `${signal.name}-${index}`}>
            <span>
              {signal.label ? `${signal.label} · ` : ""}
              {signal.name}
            </span>
            <strong>
              {roundedTie
                ? String(signal.affinity)
                : signal.affinity.toFixed(3)}
            </strong>
          </div>
        ))}
      </div>
      <small>
        {direct
          ? "2 confirmed options · recorded in the frozen receipt"
          : `${signals.slice(0, 3).length} recorded audience signals shown`}
      </small>
      {tags.length > 0 && (
        <div className="qloo-taste-profile">
          <h3>Audience taste profile</h3>
          <p>
            Associated tags from Qloo Taste Analysis for the selected tastes.
            Relevance scores, not vote probabilities.
          </p>
          <div className="qloo-profile-tags" aria-label="Audience taste tags">
            {tags.map((tag) => (
              <span key={tag.tag_id || tag.name}>
                {tag.name}
                <strong>{tag.affinity.toFixed(3)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
      {profile && !tags.length && (
        <p className="muted qloo-profile-unavailable" role="status">
          {profile.status === "empty"
            ? "Qloo returned no taste-profile tags for this category."
            : "Taste Analysis was unavailable for this run."}{" "}
          The Agent uses only the successfully recorded signals.
        </p>
      )}
      <details className="qloo-explanation">
        <summary>Why these Qloo signals?</summary>
        {explanations.length ? (
          <>
            <p>
              Normalized seed influence reported by Qloo within each result.
              These values are not voting percentages or proof of causation.
            </p>
            <div className="qloo-explanation-grid">
              {explanations.map((signal) => (
                <section key={signal.id}>
                  <h4>
                    {signal.label ? `${signal.label} · ` : ""}
                    {signal.name}
                  </h4>
                  <ul>
                    {signal.contributors.map((contributor) => (
                      <li key={contributor.id}>
                        <span>{contributor.name}</span>
                        <meter
                          min="0"
                          max="1"
                          value={contributor.score}
                          aria-label={`Influence of ${contributor.name} on ${signal.name}`}
                        />
                        <strong>{contributor.score.toFixed(3)}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : (
          <p>No per-seed explanation was recorded for this run.</p>
        )}
      </details>
    </section>
  );
}
