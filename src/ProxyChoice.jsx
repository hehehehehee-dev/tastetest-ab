import React, { useState } from "react";

export default function ProxyChoice({
  options,
  busy,
  hasAi,
  aiAvailable,
  onComplete,
}) {
  const [pick, setPick] = useState(null);
  return (
    <div className="proxy-visitor-choice">
      <h3>Your guess · optional</h3>
      <p>
        {hasAi
          ? "AI is already recorded."
          : aiAvailable
            ? "AI will run automatically before the outcome is revealed."
            : "AI is unavailable on this server and will be marked Not run."}{" "}
        You can make your own guess or skip it.
      </p>
      <div className="case-navigation-links">
        {options.map((option, i) => {
          const choice = i ? "B" : "A";
          return (
            <button
              type="button"
              className="button"
              key={choice}
              disabled={busy}
              aria-pressed={pick === choice}
              onClick={() => setPick(choice)}
            >
              {choice} · {option.title || option.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="button primary"
        disabled={busy}
        onClick={() => onComplete(pick)}
      >
        {busy
          ? "Preparing results…"
          : pick
            ? "Show results"
            : "Skip my guess → Show results"}
      </button>
      {pick && (
        <button
          type="button"
          className="button subtle"
          disabled={busy}
          onClick={() => setPick(null)}
        >
          Skip my guess
        </button>
      )}
    </div>
  );
}
