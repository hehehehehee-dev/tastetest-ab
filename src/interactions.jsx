import React from "react";
import { ArrowRight, Check, Crosshair, LockKeyhole } from "lucide-react";

function FlowArrow({ label }) {
  return (
    <div className="taste-flow-arrow" aria-hidden="true">
      <span>{label}</span>
      <ArrowRight size={18} />
    </div>
  );
}

export function TasteFlow({ test }) {
  const seeds = test.seeds || [];
  const signals = (test.insights || []).filter(
    (signal) => signal.name && Number.isFinite(signal.affinity),
  );
  const scores = test.prediction || [];
  const direct =
    test.comparison?.payload?.qloo?.method === "direct-entity-affinity";
  const qlooBranch = test.comparison?.payload?.qloo;
  const higherScorePolicy = qlooBranch?.decisionPolicy === "higher-score-v1";
  const winner = direct
    ? ({ A: 0, B: 1 }[test.comparison.payload.qloo.choice] ?? null)
    : scores.length < 2 || scores[0].score === scores[1].score
      ? null
      : scores[0].score > scores[1].score
        ? 0
        : 1;
  const modeLabel =
    test.mode === "real" ? "Qloo API signals" : "Synthetic demo signals";

  return (
    <figure
      className="taste-flow"
      aria-label="How TasteTest turns audience tastes into an A/B prediction"
    >
      <figcaption className="taste-flow-caption">
        <span>
          <Crosshair size={13} /> HOW THE PICK IS BUILT
        </span>
        <span>CASE DATA · NO HIDDEN STEPS</span>
      </figcaption>

      <div className="taste-flow-track">
        <section className="taste-flow-stage taste-flow-inputs">
          <span className="taste-flow-step">01 · INPUT</span>
          <h3>{seeds.length} taste seeds</h3>
          <div className="taste-flow-chips">
            {seeds.map((seed) => (
              <span key={seed.entity_id}>{seed.name}</span>
            ))}
          </div>
        </section>

        <FlowArrow label="resolve" />

        <section className="taste-flow-stage taste-flow-engine">
          <span className="taste-flow-step">02 · QLOO</span>
          <h3>Taste intelligence</h3>
          <div className="taste-flow-signals">
            {signals.slice(0, 3).map((signal) => (
              <div key={signal.name}>
                <span>{signal.name}</span>
                <strong>{signal.affinity.toFixed(3)}</strong>
              </div>
            ))}
          </div>
          <small>{modeLabel}</small>
        </section>

        <FlowArrow label="score" />

        <section className="taste-flow-stage taste-flow-output">
          <span className="taste-flow-step">
            {direct ? "03 · DIRECT AFFINITY" : "03 · A/B FIT"}
          </span>
          <h3>
            {winner === null
              ? "Too close to call"
              : direct
                ? "Qloo pick"
                : "Predicted pick"}
          </h3>
          <div className="taste-flow-scores">
            {test.options.slice(0, 2).map((option, index) => (
              <div
                className={winner === index ? "is-winner" : ""}
                key={option.title}
                title={option.title}
              >
                <span>
                  {index === 0 ? "A" : "B"} · {option.title}
                </span>
                <strong>
                  {direct && Number.isFinite(scores[index]?.score)
                    ? scores[index].score.toFixed(1)
                    : (scores[index]?.score ?? "—")}
                </strong>
              </div>
            ))}
          </div>
          {winner !== null && (
            <p>
              <Check size={13} /> {winner === 0 ? "A" : "B"} has the stronger
              {direct && higherScorePolicy
                ? " recorded affinity"
                : " audience fit"}
            </p>
          )}
          {direct && (
            <small>
              {higherScorePolicy
                ? winner === null
                  ? "Equal affinity; neither option is higher. "
                  : qlooBranch.lowSeparation
                    ? "Low separation; the pick follows higher affinity. "
                    : ""
                : winner === null
                  ? "Qloo abstains below a 10-point fit gap. "
                  : ""}
              Fit /100 = affinity × 100; not vote probability.
            </small>
          )}
        </section>
      </div>

      <div className="taste-flow-footer">
        <LockKeyhole size={13} />
        <span>Freeze the prediction</span>
        <ArrowRight size={13} />
        <span>poll real people</span>
        <ArrowRight size={13} />
        <strong>reveal the verdict</strong>
      </div>
    </figure>
  );
}
