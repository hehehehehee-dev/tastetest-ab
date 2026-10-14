import React, { useEffect, useState } from "react";

export default function OptionEntityPicker({
  label,
  title,
  category,
  selected,
  onSelect,
  onClear,
}) {
  const [query, setQuery] = useState(title || "");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setQuery(title || "");
  }, [title]);
  useEffect(() => {
    setResults([]);
    setError("");
    if (selected || query.trim().length < 2) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), type: category });
        const response = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || "Couldn't search Qloo. Please try again.");
        if (!controller.signal.aborted)
          setResults((data.results?.entities || []).slice(0, 8));
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, category, selected]);

  const details = (entity) =>
    [entity.category, entity.releaseYear, entity.locationLabel]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="qloo-option-picker">
      {selected ? (
        <div className="qloo-option-confirmed">
          <strong>Confirmed: {selected.name}</strong>
          <small>
            {details(selected)} · #{selected.entity_id.slice(0, 8)}
          </small>
          <button type="button" className="button subtle" onClick={onClear}>
            Change Option {label} match
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={`qloo-option-${label}`}>
            Find Option {label} in Qloo
          </label>
          <input
            id={`qloo-option-${label}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search an exact ${category.toLowerCase()} name…`}
            maxLength={100}
          />
          <p className="muted">
            Choose the exact item. Check its year or location; no match is
            selected automatically.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div
            className="qloo-option-results"
            aria-label={`Qloo matches for Option ${label}`}
            aria-live="polite"
          >
            {busy ? (
              <p className="muted">Searching Qloo…</p>
            ) : results.length ? (
              results.map((entity) => (
                <button
                  key={entity.entity_id}
                  type="button"
                  className="seed-button"
                  onClick={() => onSelect(entity)}
                  aria-label={`Confirm Option ${label}: ${entity.name} · ${details(entity)} · ${entity.entity_id.slice(0, 8)}`}
                >
                  <span className="seed-result-text">
                    <span>{entity.name}</span>
                    <small>
                      {details(entity)} · #{entity.entity_id.slice(0, 8)}
                    </small>
                  </span>
                </button>
              ))
            ) : query.trim().length >= 2 ? (
              <p className="muted">
                No matching item. Try another name, or choose Custom ideas.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
