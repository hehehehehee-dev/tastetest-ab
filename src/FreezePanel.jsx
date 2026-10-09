import React, { useState } from "react";
import { benchmarkApi, BranchTable } from "./Benchmark.jsx";
const initial = () => ({ pick: "A", confidence: 50, source: "", answer: "" });
function ManualFields({ name, value, update, tie = false }) {
  return (
    <fieldset className="manual-branch">
      <legend>{name}</legend>
      <label>
        Pick
        <select
          aria-label="Pick"
          value={value.pick}
          onChange={(e) => update("pick", e.target.value)}
        >
          <option>A</option>
          <option>B</option>
          {tie && <option value="TIE">Too close to call</option>}
        </select>
      </label>
      <label>
        Confidence (0–100)
        <input
          type="number"
          min="0"
          max="100"
          required
          value={value.confidence}
          onChange={(e) => update("confidence", Number(e.target.value))}
        />
      </label>
      <label>
        Source (exact model/version or human)
        <input
          required
          maxLength={160}
          value={value.source}
          onChange={(e) => update("source", e.target.value)}
          placeholder="Exact model + version, or human"
        />
      </label>
      <label>
        Paste the original answer
        <textarea
          required
          minLength={10}
          maxLength={6000}
          rows={3}
          value={value.answer}
          onChange={(e) => update("answer", e.target.value)}
        />
      </label>
    </fieldset>
  );
}
export default function FreezePanel({ test, owner, onFrozen }) {
  const [branches, setBranches] = useState({
    llm: initial(),
    qloo: initial(),
    agent: initial(),
  });
  const [manual, setManual] = useState(false),
    [originalRecordedAt, setOriginal] = useState("");
  const [beforeOutcome, setBefore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [metadata, setMetadata] = useState(
    test.benchmarkMetadata || { track: "rehearsal" },
  );
  const setMeta = (key, value) =>
    setMetadata((old) => ({ ...old, [key]: value }));
  if (test.freeze) {
    const p = test.freeze.payload;
    return (
      <section className="panel freeze-panel">
        <div className="eyebrow">IMMUTABLE PREDICTION RECEIPT</div>
        <h2>Frozen at {p.frozenAt}</h2>
        <p>
          {p.caseLabel} · {p.mode} · {test.lifecycle}
        </p>
        <BranchTable branches={p.branches} result={test.benchmarkResult} />
        <p>{p.note}</p>
        {p.originalRecordedAt && (
          <p>
            Owner-declared original timestamp: {p.originalRecordedAt}. This
            import was sealed in the app at {p.frozenAt}.
          </p>
        )}
        <p className="receipt-hash">SHA-256 {test.freeze.sha256}</p>
        <button
          className="button subtle"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(test.freeze, null, 2)], {
                type: "application/json",
              }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `${p.caseLabel}-freeze.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download freeze receipt
        </button>
        <details>
          <summary>Original answers and case context</summary>
          <p>
            {p.metadata.business} · {p.metadata.decision} · {p.metadata.channel}
          </p>
          {Object.entries(p.branches)
            .filter(([, b]) => b.answer)
            .map(([key, b]) => (
              <div key={key}>
                <h3>{key === "llm" ? "LLM-only (manual paste)" : key}</h3>
                <p className="pasted-answer">{b.answer}</p>
              </div>
            ))}
        </details>
        {test.benchmarkResult && (
          <p>
            <strong>
              {test.benchmarkResult.eligible
                ? "Eligible for the tally"
                : "Excluded from the tally"}
            </strong>{" "}
            ·{" "}
            {test.benchmarkResult.reasons.join("; ") ||
              `${test.totalVotes} votes`}
          </p>
        )}
        <a href="/benchmark">View benchmark ledger ↗</a>
      </section>
    );
  }
  if (!test.freezeRequired || !owner) return null;
  async function freeze(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onFrozen(
        await benchmarkApi(`/tests/${test.id}/freeze`, {
          method: "POST",
          headers: {
            "x-owner-token":
              localStorage.getItem(`tastetest-owner-${test.id}`) || "",
          },
          body: JSON.stringify({
            llm: branches.llm,
            ...(manual
              ? {
                  mode: "manual",
                  originalRecordedAt: new Date(
                    originalRecordedAt,
                  ).toISOString(),
                  qloo: branches.qloo,
                  agent: branches.agent,
                }
              : {}),
            metadata,
            beforeOutcome,
          }),
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel freeze-panel">
      <div className="eyebrow">BEFORE ANY VOTES</div>
      <h2>Record, then freeze.</h2>
      <p>
        Paste an independently obtained LLM answer. No LLM API call is made by
        this app. Once frozen, all fields are locked.
      </p>
      <form onSubmit={freeze}>
        <label>
          Case track
          <select
            value={metadata.track || "rehearsal"}
            onChange={(e) => setMeta("track", e.target.value)}
          >
            <option value="rehearsal">Workflow rehearsal / public case</option>
            <option value="track-b">Track B — unpublished taste case</option>
          </select>
        </label>
        <div className="freeze-context">
          {[
            ["caseLabel", "Case label"],
            ["business", "Business (anonymized)"],
            ["decision", "Decision being tested"],
            ["channel", "Planned poll channel"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={metadata[key] || ""}
                maxLength={key === "caseLabel" ? 60 : 300}
                onChange={(e) => setMeta(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!metadata.unpublished}
            onChange={(e) => setMeta("unpublished", e.target.checked)}
          />
          This is a fresh unpublished case, with no public outcome.
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!metadata.audienceVerified}
            onChange={(e) => setMeta("audienceVerified", e.target.checked)}
          />
          The planned voters actually share the recorded taste seeds.
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => setManual(e.target.checked)}
          />
          Record external predictions manually (all three branches required)
        </label>
        <ManualFields
          name="LLM-only (manual paste)"
          value={branches.llm}
          update={(key, value) =>
            setBranches((old) => ({
              ...old,
              llm: { ...old.llm, [key]: value },
            }))
          }
        />
        {manual ? (
          <>
            <p>
              Do not invent a missing Qloo-only answer. Keep incomplete external
              cases in draft.
            </p>
            <label>
              Original prediction timestamp
              <input
                type="datetime-local"
                required
                value={originalRecordedAt}
                onChange={(e) => setOriginal(e.target.value)}
              />
            </label>
            {["qloo", "agent"].map((key) => (
              <ManualFields
                key={key}
                name={key === "qloo" ? "Qloo (external)" : "Agent (external)"}
                tie
                value={branches[key]}
                update={(field, value) =>
                  setBranches((old) => ({
                    ...old,
                    [key]: { ...old[key], [field]: value },
                  }))
                }
              />
            ))}
          </>
        ) : (
          <p>
            Qloo and Agent will use the displayed scoreOption heuristic. Their
            picks currently coincide; heuristic confidence is not a probability
            of winning.
          </p>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            required
            checked={beforeOutcome}
            onChange={(e) => setBefore(e.target.checked)}
          />
          All predictions were recorded before collecting any outcome or vote.
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Freezing…" : "Freeze predictions"}
        </button>
      </form>
    </section>
  );
}
