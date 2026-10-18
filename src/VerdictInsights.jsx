import React from "react";
import {
  disagreementLine,
  surpriseNotes,
  verdictBranchRows,
} from "./verdictReport.mjs";

const pickLabel = (pick) =>
  pick === "A" || pick === "B"
    ? `Option ${pick}`
    : pick === "TIE"
      ? "Abstained"
      : "Not recorded";

export default function VerdictInsights({
  branches,
  grades,
  actual,
  actualMargin,
  fitGap,
  marginName,
  grounding,
  baselineHref = "#keyword-baseline",
  baselineNote,
  branchKeys,
  branchLabels,
  illustrativePick = null,
}) {
  const rows = verdictBranchRows(branches, grades, actual, {
    ...(branchKeys ? { keys: branchKeys } : {}),
    ...(branchLabels ? { labels: branchLabels } : {}),
  });
  const surprises = surpriseNotes({
    rows,
    actual,
    actualMargin,
    fitGap,
    marginName,
  });
  const hasRecordedBranch = rows.some((row) =>
    ["A", "B", "TIE"].includes(row.pick),
  );
  const displayedSurprises = hasRecordedBranch
    ? surprises
    : [
        illustrativePick === actual
          ? `The illustrative concept-fit prediction matched the sample outcome: Option ${actual}.`
          : `The illustrative concept-fit prediction and sample outcome selected different options.`,
      ];
  return (
    <>
      <section className="verdict-report-section verdict-disagreement">
        <div className="verdict-section-label">02</div>
        <div>
          <h3>Where we disagreed</h3>
          {baselineNote && (
            <p className="verdict-context-note">{baselineNote}</p>
          )}
          {hasRecordedBranch ? (
            <>
              <div className="verdict-branch-grid">
                {rows.map((row) => (
                  <article className="verdict-branch" key={row.key}>
                    <span>{row.label}</span>
                    <strong>{pickLabel(row.pick)}</strong>
                    {row.key === "qloo" && branches.qloo?.fallback && (
                      <span className="qloo-fallback-badge">
                        Qloo: no data for these options — heuristic fallback
                      </span>
                    )}
                    <small>
                      {row.confidence === null
                        ? "Confidence not recorded"
                        : `${row.confidence}/100 confidence`}
                      {row.gap === null
                        ? ""
                        : ` · ${Math.round(row.gap)}-point fit gap`}
                    </small>
                    <em className={`verdict-branch-status is-${row.status}`}>
                      {row.status}
                    </em>
                  </article>
                ))}
              </div>
              <p className="verdict-rule-note">{disagreementLine(rows)}</p>
              <p className="calibration-line">
                Confidence and fit gaps describe signal separation; they are not
                calibrated probabilities.
              </p>
            </>
          ) : (
            <p className="verdict-empty-branches">
              {`This demo records one concept-fit prediction${["A", "B"].includes(illustrativePick) ? `: Option ${illustrativePick}` : ""}${fitGap == null ? "" : ` with a ${Math.round(fitGap)}-point fit gap`}. AI-only and Qloo were not run as separate branches for this illustrative sample.`}
            </p>
          )}
        </div>
      </section>
      <section className="verdict-report-section verdict-surprises">
        <div className="verdict-section-label">03</div>
        <div>
          <h3>What surprised us</h3>
          <ul>
            {displayedSurprises.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="verdict-report-section verdict-grounding">
        <div className="verdict-section-label">04</div>
        <div>
          <h3>How this verdict was built</h3>
          <p>{grounding}</p>
          <a href={baselineHref}>Without Qloo / keyword baseline comparison</a>
        </div>
      </section>
    </>
  );
}
