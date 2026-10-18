import React, { useEffect, useState } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import { predictionWorkElapsed } from "../shared/predictionWork.mjs";

const seconds = (milliseconds) =>
  milliseconds < 100 ? "<0.1s" : `${(milliseconds / 1000).toFixed(1)}s`;

function StepTime({ step }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (step.status !== "active") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [step.status]);
  if (Number.isFinite(step.elapsedMs)) return seconds(step.elapsedMs);
  if (step.status === "active" && step.startedAt)
    return seconds(Math.max(0, now - Date.parse(step.startedAt)));
  return "—";
}

const icons = {
  pending: Circle,
  active: Loader2,
  done: Check,
  failed: X,
};

export default function PredictionStepFeed({ work }) {
  if (!work?.steps?.length) return null;
  const complete = work.steps.every((step) => step.status === "done");
  const done = work.steps.filter((step) => step.status === "done").length;
  const waitingForEvidence =
    work.context === "track-b" &&
    done === 4 &&
    work.steps.slice(4).every((step) => step.status === "pending");
  const summary = complete
    ? `6 steps · ${seconds(predictionWorkElapsed(work))} · frozen #${work.sha256?.slice(0, 6) || "pending"}`
    : `Agent work · ${done} of 6 steps`;
  return (
    <details
      className="prediction-step-feed panel"
      open={!complete || undefined}
    >
      <summary>{summary}</summary>
      <div className="prediction-step-body">
        {work.mode === "mock" && (
          <p className="prediction-mock-label">
            Mock signals — synthetic affinities, workflow demonstration only.
          </p>
        )}
        <ol>
          {work.steps.map((step) => {
            const Icon = icons[step.status] || Circle;
            return (
              <li className={`is-${step.status}`} key={step.id}>
                <Icon aria-hidden="true" size={16} />
                <div>
                  <strong>
                    {step.label.replaceAll("LLM-only", "AI-only")}
                  </strong>
                  {(step.detail || step.message) && (
                    <small>
                      {(step.message || step.detail).replaceAll(
                        "LLM-only",
                        "AI-only",
                      )}
                    </small>
                  )}
                </div>
                <time>
                  <StepTime step={step} />
                </time>
              </li>
            );
          })}
        </ol>
        {waitingForEvidence && (
          <p className="prediction-step-waiting">
            Waiting for you to record and freeze the evidence fields below.
          </p>
        )}
        <p className="prediction-step-honesty">
          Showing the agent&apos;s work — this does not prove the prediction is
          correct.
        </p>
      </div>
    </details>
  );
}
