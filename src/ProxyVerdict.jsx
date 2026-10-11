import { toPng } from "html-to-image";
import React, { useRef, useState } from "react";
import VerdictInsights from "./VerdictInsights.jsx";
import { normalizedOutcomeMargin } from "./verdictReport.mjs";

export default function ProxyVerdict({ run, music = false }) {
  const card = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const { outcome } = run;
  const winnerIndex = outcome.actual === "A" ? 0 : 1;
  const winner = run.options[winnerIndex];
  const max = music ? Math.max(...outcome.options.map((o) => o.mean), 1) : 5;
  const branches = run.freeze?.payload?.branches || {};
  const grades = run.result?.grades || {};
  const means = outcome.options.map((option) => option.mean);
  const actualMargin = normalizedOutcomeMargin(means, music ? undefined : 5);
  const fitGap =
    branches.qloo?.gap ??
    (run.prediction?.length === 2
      ? Math.abs(run.prediction[0].score - run.prediction[1].score)
      : null);
  const affinitySignals =
    run.freeze?.payload?.provenance?.affinities?.length || 0;
  const observedRecords = outcome.options.reduce(
    (total, option) => total + (option.count || 0),
    0,
  );
  const frozenAt = run.freeze?.payload?.frozenAt || run.frozenAt || null;
  const receiptHash = run.freeze?.sha256 || null;
  const qlooPick = branches.qloo?.pick;
  const matchBadge =
    qlooPick === "A" || qlooPick === "B"
      ? qlooPick === outcome.actual
        ? "Qloo matched"
        : "Qloo missed"
      : "Qloo abstained";
  const rawMargin = Math.abs(means[0] - means[1]);
  const grounding = `Verdict built from ${affinitySignals} Qloo affinity signals · ${outcome.segmentUsers} segment users · ${observedRecords} ${music ? "listening records" : "ratings"} · frozen ${frozenAt || "not recorded"} · SHA-256 ${receiptHash ? receiptHash.slice(0, 12) : "not recorded"}.`;

  async function exportImage() {
    setExporting(true);
    setNotice("");
    try {
      await document.fonts.ready;
      const data = await toPng(card.current, {
        pixelRatio: 2,
        backgroundColor: "#131313",
      });
      const link = document.createElement("a");
      link.download = `tastetest-${music ? "music" : "film"}-${run.proxyCaseId}-verdict.png`;
      link.href = data;
      link.click();
      setNotice("Verdict image downloaded.");
    } catch {
      setNotice(
        "Image export failed. Try Print report to save this verdict as a PDF.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="proxy-verdict-report">
      <div className="verdict-actions proxy-verdict-actions">
        <button
          type="button"
          className="button subtle print-button"
          onClick={() => window.print()}
        >
          Print report
        </button>
        <button
          type="button"
          className="button subtle"
          disabled={exporting}
          onClick={exportImage}
        >
          {exporting ? "Exporting…" : "Share verdict image"}
        </button>
      </div>
      <section
        ref={card}
        className="panel proxy-outcome"
        aria-labelledby="proxy-winner"
      >
        <div className="proxy-verdict-topline">
          <span className="eyebrow">TASTETEST / VERDICT REPORT</span>
          <span className="proxy-verdict-tag">
            Proxy-{music ? "music" : "film"} · historical preferences
          </span>
        </div>
        <section className="verdict-report-section verdict-report-headline">
          <div className="verdict-section-label">01</div>
          <div>
            <h2>The Verdict</h2>
            <div className="proxy-winner-hero">
              <div className="proxy-winner-letter" aria-hidden="true">
                {outcome.actual}
              </div>
              <div>
                <h2 id="proxy-winner">
                  <span>Segment winner: Option {outcome.actual}</span>
                  {winner.title || winner.name}
                </h2>
                <p>
                  {outcome.segmentUsers} users ·{" "}
                  {music
                    ? "all three seeds in their top 20% of observed listening"
                    : "liked all three seed movies"}
                </p>
                <div className="verdict-headline-meta">
                  <span>
                    {rawMargin.toFixed(3)}{" "}
                    {music ? "mean-listen" : "rating-point"} margin
                  </span>
                  <strong
                    className={`verdict-match is-${matchBadge.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {matchBadge}
                  </strong>
                </div>
              </div>
            </div>
            <div className="proxy-verdict-bars">
              {outcome.options.map((option, i) => {
                const selected = i === winnerIndex;
                const label = i ? "B" : "A";
                return (
                  <div
                    className={`proxy-verdict-option ${selected ? "is-winner" : ""}`}
                    key={label}
                  >
                    <div className="proxy-verdict-bar-label">
                      <span>
                        <b>{label}</b>{" "}
                        {run.options[i].title || run.options[i].name}
                      </span>
                      <strong>
                        {option.mean.toFixed(3)}
                        {music ? "" : "/5"}
                      </strong>
                    </div>
                    <div className="proxy-verdict-track" aria-hidden="true">
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, (option.mean / max) * 100))}%`,
                        }}
                      />
                    </div>
                    <p>
                      {selected && <b>WINNER · </b>}
                      {music
                        ? `mean ${option.mean.toFixed(3)} observed listens per segment user; ${option.count} segment listeners · ${option.overallListeners} overall listeners`
                        : `mean ${option.mean.toFixed(3)}/5 from ${option.count} segment ratings · ${option.overallRatings} overall ratings`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <VerdictInsights
          branches={branches}
          grades={grades}
          actual={outcome.actual}
          actualMargin={actualMargin}
          fitGap={fitGap}
          marginName={music ? "Listening margin" : "Rating margin"}
          grounding={grounding}
          baselineHref="/?view=verdict#keyword-baseline"
        />
        <div className="proxy-verdict-footer">
          <p>
            Historical preferences, not business results or causal effects. This
            proxy never contributes to Track B.
          </p>
          <a href="/benchmark">View separate proxy tally ↗</a>
        </div>
      </section>
      {notice && (
        <p role="status" className="export-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
