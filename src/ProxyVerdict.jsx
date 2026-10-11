import React from "react";

export default function ProxyVerdict({ run, music = false }) {
  const { outcome } = run;
  const winnerIndex = outcome.actual === "A" ? 0 : 1;
  const winner = run.options[winnerIndex];
  const max = music ? Math.max(...outcome.options.map((o) => o.mean), 1) : 5;
  return (
    <section className="panel proxy-outcome" aria-labelledby="proxy-winner">
      <div className="proxy-verdict-topline">
        <span className="eyebrow">THE ACTUAL RESULT</span>
        <span className="proxy-verdict-tag">
          {music ? "Last.fm" : "MovieLens"} · historical preferences
        </span>
      </div>
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
                  <b>{label}</b> {run.options[i].title || run.options[i].name}
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
      <div className="proxy-verdict-footer">
        <p>
          Historical preferences, not business results or causal effects. This
          proxy never contributes to Track B.
        </p>
        <a href="/benchmark">View separate proxy tally ↗</a>
      </div>
    </section>
  );
}
