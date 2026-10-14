import React from "react";
import "./test-context.css";

export default function TestContextMeter({
  options,
  seeds,
  note,
  entities,
  direct,
  automatic,
  mode,
}) {
  const fields = options.map(
    (option) =>
      [option.title, option.description].filter((value) => value.trim()).length,
  );
  const tastes = Math.min(5, seeds.length);
  const matches = direct ? entities.filter(Boolean).length : 0;
  const provided =
    fields[0] + fields[1] + tastes + Number(Boolean(note.trim())) + matches;
  const total = direct ? 12 : 10;
  const ready =
    fields.every((count) => count === 2) &&
    tastes >= 3 &&
    (!direct || matches === 2);
  const next =
    fields[0] < 2
      ? `Add ${options[0].title.trim() ? "a description" : "a name"} for Option A.`
      : fields[1] < 2
        ? `Add ${options[1].title.trim() ? "a description" : "a name"} for Option B.`
        : direct && matches < 2
          ? "Confirm the exact Qloo match for both options."
          : tastes < 3
            ? `Choose ${3 - tastes} more audience ${tastes === 2 ? "taste" : "tastes"} to predict.`
            : !automatic
              ? "Decision context complete. Finish the evidence record below."
              : provided === total
                ? "All listed context added. Review your details, then predict."
                : "Ready to predict. A fourth or fifth relevant taste and an audience note are optional.";
  return (
    <section
      className="test-context-meter"
      aria-label="Test context completeness"
    >
      <div className="test-context-heading">
        <strong>Build your test context</strong>
        <span aria-live="polite">
          {provided}/{total} details added
          {ready
            ? automatic
              ? " · Ready to predict"
              : " · Decision context complete"
            : ""}
        </span>
      </div>
      <div
        className="test-context-track"
        role="progressbar"
        aria-label="Test context completeness"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={provided}
        aria-valuetext={`${provided} of ${total} details added. ${ready ? "Required decision context complete." : next}`}
      >
        <span style={{ width: `${(provided / total) * 100}%` }} />
      </div>
      <ul>
        <li>
          Option A <strong>{fields[0]}/2</strong>
        </li>
        <li>
          Option B <strong>{fields[1]}/2</strong>
        </li>
        <li>
          Tastes <strong>{tastes}/5 · 3 required</strong>
        </li>
        <li>
          Audience note <strong>{note.trim() ? "Added" : "Optional"}</strong>
        </li>
        {direct && (
          <li>
            Confirmed items <strong>{matches}/2</strong>
          </li>
        )}
      </ul>
      <p className="test-context-next">{next}</p>
      <small>
        {!automatic
          ? "Relevant details document your decision and audience."
          : mode === "real"
            ? "Relevant details help the Agent. Qloo uses selected tastes and confirmed items."
            : "Relevant details describe the decision; this demo uses synthetic taste signals."}{" "}
        This bar tracks completeness, not prediction confidence.
      </small>
    </section>
  );
}
