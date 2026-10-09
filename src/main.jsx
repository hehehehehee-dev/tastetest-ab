import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Disc3,
  Film,
  BookOpen,
  Utensils,
  Tag,
  Plus,
  Search,
  X,
  Sparkles,
  Radio,
  Printer,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Link2,
} from "lucide-react";
import "./styles.css";
import "./lab.css";
import { TasteMap } from "./interactions.jsx";
import CaseStudy from "./CaseStudy.jsx";
import AiComparison from "./AiComparison.jsx";
import Benchmark from "./Benchmark.jsx";
import FreezePanel from "./FreezePanel.jsx";
import { predictionConfidence } from "../shared/confidence.mjs";

const categoryIcons = {
  Music: Disc3,
  "Film/TV": Film,
  Dining: Utensils,
  Brands: Tag,
  Books: BookOpen,
};
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}
function navigate(url) {
  window.history.pushState({}, "", url);
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  window.dispatchEvent(new Event("popstate"));
}
function useRoute() {
  const [route, setRoute] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return route;
}
function getLocal(key, fallback = null) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function saveLocal(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function ownerKey(id) {
  return `tastetest-owner-${id}`;
}
function winnerFor(scores) {
  return predictionConfidence(scores).tooClose
    ? null
    : scores[0].score > scores[1].score
      ? 0
      : 1;
}
function Button({ children, className = "", busy, ...props }) {
  return (
    <button
      className={`button ${className}`}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  );
}
function ErrorMessage({ children }) {
  return children ? (
    <div className="error" role="alert">
      <AlertTriangle size={17} />
      {children}
    </div>
  ) : null;
}
function Chip({ entity, onRemove }) {
  const Icon = categoryIcons[entity.category] || Tag;
  return (
    <span className="chip">
      <Icon size={13} />
      {entity.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${entity.name}`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
function AnimatedNumber({ value, suffix = "" }) {
  const [shown, setShown] = useState(0);
  const previous = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      previous.current = value;
      return;
    }
    const from = previous.current;
    const start = performance.now();
    let frame;
    const step = (time) => {
      const progress = Math.min(1, (time - start) / 650);
      setShown(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    previous.current = value;
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      {shown}
      {suffix}
    </>
  );
}
function OptionImage({ option }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [option.imageUrl]);
  return option.imageUrl && !failed ? (
    <img
      className="option-image"
      src={option.imageUrl}
      alt={`${option.title} concept`}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  ) : failed ? (
    <p className="muted">
      Image unavailable. Your description is still included.
    </p>
  ) : null;
}
function Header({ mode, configured }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="brand-mark">
            <BarChart3 size={20} />
          </span>
          TasteTest<span className="brand-ab">A/B</span>
        </a>
        <div className="header-right">
          <span className="mock-pill">
            {mode === "loading"
              ? "Checking Qloo configuration…"
              : mode === "unavailable"
                ? "Qloo status unavailable"
                : mode === "real"
                  ? configured
                    ? "Qloo API enabled"
                    : "Qloo key not configured"
                  : "Mock mode — Qloo not connected"}
          </span>
          <a
            href="/create"
            onClick={(e) => {
              e.preventDefault();
              navigate("/create");
            }}
            className="header-new"
          >
            <Plus size={15} /> New test
          </a>
        </div>
      </div>
    </header>
  );
}
function Steps({ active }) {
  return (
    <nav className="steps" aria-label="Test progress">
      {["Create a test", "Agent prediction", "Poll & verdict"].map(
        (label, index) => (
          <React.Fragment key={label}>
            <span
              className={
                active === index ? "active" : active > index ? "completed" : ""
              }
            >
              <span className="step-number">
                {active > index ? <Check size={12} /> : `0${index + 1}`}
              </span>
              {label}
            </span>
            {index < 2 && <ChevronRight size={13} className="step-separator" />}
          </React.Fragment>
        ),
      )}
    </nav>
  );
}

function CreateTest({ mode }) {
  const [insightCategory, setInsightCategory] = useState("Dining");
  const [options, setOptions] = useState([
    { title: "", description: "", imageUrl: "" },
    { title: "", description: "", imageUrl: "" },
  ]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Music");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState("");
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    setSearching(true);
    setSearchError("");
    const timer = setTimeout(
      () =>
        api(
          `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(category)}`,
        )
          .then((data) => {
            if (current) setResults(data.results.entities);
          })
          .catch((e) => {
            if (current) setSearchError(e.message);
          })
          .finally(() => {
            if (current) setSearching(false);
          }),
      180,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, category]);
  function update(index, field, value) {
    setOptions((old) =>
      old.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    );
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (selected.length < 3) {
      setError(
        "Choose at least 3 taste seeds so the audience has enough context.",
      );
      return;
    }
    setBusy(true);
    try {
      const data = await api("/tests", {
        method: "POST",
        body: JSON.stringify({
          options,
          seedEntityIds: selected.map((e) => e.entity_id),
          audienceNote: note,
          insightCategory,
          benchmarkMetadata: {
            track:
              location.pathname === "/benchmark/new" ? "track-b" : "rehearsal",
          },
        }),
      });
      if (!saveLocal(ownerKey(data.test.id), data.ownerToken))
        throw new Error(
          "Your browser blocked local storage. Allow it to keep your owner controls.",
        );
      let cases = [];
      try {
        cases = JSON.parse(getLocal("tastetest-cases", "[]"));
      } catch {}
      saveLocal(
        "tastetest-cases",
        JSON.stringify([...new Set([...cases, data.test.id])]),
      );
      navigate(`/test/${data.test.id}?view=prediction`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container">
      <Steps active={0} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">A SMALL TEST. A CLEARER DECISION.</div>
          <h1>What are you deciding between?</h1>
          <p>Give two ideas the same audience. See which one resonates.</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="option-grid form-options">
          {options.map((option, i) => (
            <section className="panel option-form" key={i}>
              <div className="panel-heading">
                <span className="option-letter">{i ? "B" : "A"}</span>
                <h2>Option {i ? "B" : "A"}</h2>
              </div>
              <label htmlFor={`title-${i}`}>Give it a name</label>
              <input
                id={`title-${i}`}
                value={option.title}
                onChange={(e) => update(i, "title", e.target.value)}
                placeholder={i ? "Your second concept" : "Your first concept"}
                required
                maxLength={100}
              />
              <label htmlFor={`description-${i}`}>Describe the idea</label>
              <textarea
                id={`description-${i}`}
                value={option.description}
                onChange={(e) => update(i, "description", e.target.value)}
                placeholder="The mood, message, offer, and details that make it different…"
                required
                minLength={10}
                maxLength={1200}
                rows={4}
              />
              <label htmlFor={`image-${i}`}>
                Image URL <span className="optional">optional</span>
              </label>
              <input
                id={`image-${i}`}
                type="url"
                value={option.imageUrl}
                onChange={(e) => update(i, "imageUrl", e.target.value)}
                placeholder="https://…"
              />
              <OptionImage option={option} />
            </section>
          ))}
        </div>
        <section className="panel audience-panel">
          <div className="section-heading">
            <div>
              <h2>Who is this for?</h2>
              <p>
                Choose 3–5 things your audience loves. Mix across categories.
              </p>
            </div>
            <span
              className={`selection-count ${selected.length >= 3 ? "ready" : ""}`}
            >
              {selected.length} / 5 selected
            </span>
          </div>
          <div
            className="category-tabs"
            role="tablist"
            aria-label="Taste categories"
          >
            {Object.entries(categoryIcons).map(([name, Icon]) => (
              <button
                type="button"
                role="tab"
                aria-selected={category === name}
                className={category === name ? "selected" : ""}
                key={name}
                onClick={() => setCategory(name)}
              >
                <Icon size={15} />
                {name}
              </button>
            ))}
          </div>
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search taste seeds"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${category.toLowerCase()} tastes…`}
            />
          </div>
          <ErrorMessage>{searchError}</ErrorMessage>
          <div className="seed-results" aria-live="polite">
            {searching ? (
              <span className="muted">Finding tastes…</span>
            ) : results.length ? (
              results.map((entity) => {
                const picked = selected.some(
                  (e) => e.entity_id === entity.entity_id,
                );
                return (
                  <button
                    type="button"
                    key={entity.entity_id}
                    disabled={!picked && selected.length >= 5}
                    className={`seed-button ${picked ? "picked" : ""}`}
                    onClick={() =>
                      setSelected((old) =>
                        picked
                          ? old.filter((e) => e.entity_id !== entity.entity_id)
                          : [...old, entity],
                      )
                    }
                  >
                    {picked ? <Check size={13} /> : <Plus size={13} />}
                    {entity.name}
                  </button>
                );
              })
            ) : (
              <span className="muted">
                {mode === "real"
                  ? query.trim()
                    ? "No matching Qloo entities. Try another name or category."
                    : "Type an artist, movie, venue, brand or book name to search Qloo."
                  : "No matches in the mock catalog. Try another search or category."}
              </span>
            )}
          </div>
          <div className="selected-seeds">
            {selected.map((entity) => (
              <Chip
                key={entity.entity_id}
                entity={entity}
                onRemove={() =>
                  setSelected((old) =>
                    old.filter((e) => e.entity_id !== entity.entity_id),
                  )
                }
              />
            ))}
          </div>
          <label htmlFor="insight-category">Recommendation context</label>
          <select
            id="insight-category"
            aria-label="Recommendation context"
            value={insightCategory}
            onChange={(event) => setInsightCategory(event.target.value)}
          >
            {Object.keys(categoryIcons).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <p className="muted">
            Choose the category most relevant to your concepts. Qloo affinity
            comes from recommendations in this category.
          </p>
          <label htmlFor="audience-note">
            Anything else about your audience?{" "}
            <span className="optional">optional</span>
          </label>
          <input
            id="audience-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="e.g. IU students near campus"
          />
        </section>
        <section className="panel prediction-method">
          <h2>Three recorded branches</h2>
          <p>
            LLM-only (manual paste), Qloo and Agent. Paste an answer obtained
            independently on the next screen, then freeze every pick before
            opening the poll.
          </p>
          <p className="muted">
            No paid LLM API calls. Qloo and Agent currently share the existing
            concept-fit heuristic.
          </p>
        </section>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="form-footer">
          <p>
            <CircleHelp size={15} />
            {mode === "real"
              ? "Real Qloo affinities ground a local concept-fit heuristic; they do not predict demand or voting probabilities."
              : "Mock taste signals help test the flow, not predict real demand."}
          </p>
          <Button className="primary" busy={busy} type="submit">
            <Sparkles size={16} />
            {busy ? "Comparing your ideas…" : "Get agent prediction"}
          </Button>
        </div>
      </form>
    </main>
  );
}
function Prediction({ test, compact = false }) {
  const [without, setWithout] = useState(false);
  const scores = without ? test.baseline : test.prediction;
  const winner = winnerFor(scores);
  const confidence = predictionConfidence(scores);
  return (
    <section className={`prediction-section ${compact ? "compact" : ""}`}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">01 / THE HYPOTHESIS</div>
          <h2>What the taste signals suggest</h2>
        </div>
        <label className="toggle-label">
          <span>Keyword baseline</span>
          <input
            type="checkbox"
            checked={without}
            onChange={(e) => setWithout(e.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true" />
        </label>
      </div>
      <p className="comparison-note">
        {without
          ? "Keyword baseline · exact word overlap only"
          : test.mode === "real"
            ? "Real Qloo affinities · local concept/tag-fit heuristic"
            : "Mock cultural model · synthetic affinity + shared taste tags"}
        <span>Scores indicate fit, not vote probability.</span>
      </p>
      <div className="confidence-note" role="status">
        <strong>
          {confidence.tooClose
            ? "Too close to call"
            : `${confidence.level} heuristic confidence`}
        </strong>
        <span>
          Fit gap: {confidence.gap} points · affinity contribution gap:{" "}
          {confidence.affinityGap} points.{" "}
          {without
            ? "Keyword baseline separation."
            : test.mode === "real"
              ? "Real API signals; locally scored."
              : "Synthetic signals only."}{" "}
          Not a calibrated likelihood of being correct.
        </span>
      </div>
      <div className="option-grid">
        {test.options.map((option, i) => (
          <article
            className={`panel prediction-card ${winner === i ? "agent-winner" : ""}`}
            key={i}
          >
            <div className="panel-heading">
              <span className="option-letter">{i ? "B" : "A"}</span>
              <span className="score-caption">AUDIENCE FIT</span>
              {winner === i && (
                <span className="agent-badge">
                  <Sparkles size={12} />
                  Agent pick
                </span>
              )}
            </div>
            <div className="score-number">
              <AnimatedNumber value={scores[i].score} />
              <span>/ 100</span>
            </div>
            <div className="score-track">
              <div
                className={`score-fill ${winner === i ? "accent" : ""}`}
                style={{ width: `${scores[i].score}%` }}
              />
            </div>
            <h3>{option.title}</h3>
            <p className="option-description">{option.description}</p>
            <OptionImage option={option} />
            <ul className="reason-list">
              {scores[i].reasons.map((reason) => (
                <li key={reason}>
                  <Check size={13} />
                  {reason}
                </li>
              ))}
            </ul>
            <details className="score-details">
              <summary>
                How this score adds up<span>{scores[i].score} points</span>
              </summary>
              <dl>
                <div>
                  <dt>Starting point</dt>
                  <dd>+{scores[i].components.baseline}</dd>
                </div>
                <div>
                  <dt>
                    Cultural affinity{" "}
                    <small>(sum {scores[i].components.affinitySum})</small>
                  </dt>
                  <dd>+{scores[i].components.affinity}</dd>
                </div>
                <div>
                  <dt>{without ? "Keyword overlap" : "Shared taste tags"}</dt>
                  <dd>+{scores[i].components.tagOverlap}</dd>
                </div>
                <div>
                  <dt>Segment trade-off</dt>
                  <dd>{scores[i].components.segmentWarning}</dd>
                </div>
              </dl>
            </details>
          </article>
        ))}
      </div>
      {test.mode === "real" && !without && (
        <details className="qloo-provenance panel">
          <summary>Real Qloo signals used</summary>
          <p>
            Retrieved {test.provenance?.fetchedAt}. TasteTest maps concept text
            to Qloo tags; Qloo does not directly score these custom posters.
          </p>
          <ul>
            {test.insights.map((entity) => (
              <li key={entity.name}>
                {entity.name} · affinity {entity.affinity.toFixed(3)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!without && test.prediction.some((p) => p.warning) && (
        <div className="segment-note">
          <AlertTriangle size={16} />
          <div>
            <strong>Not everyone shares the same taste.</strong>
            {test.prediction.map(
              (p, i) =>
                p.warning && (
                  <p key={i}>
                    Option {i ? "B" : "A"}: {p.warning}
                  </p>
                ),
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function Audience({ test }) {
  return (
    <section className="audience-strip">
      <div className="eyebrow">THE AUDIENCE</div>
      <div className="audience-chip-row">
        {test.seeds.map((entity) => (
          <Chip key={entity.entity_id} entity={entity} />
        ))}
      </div>
      <p>{test.audienceNote || "Defined by the selected cultural tastes."}</p>
    </section>
  );
}
function VoteBars({ test }) {
  return (
    <div className="vote-bars">
      {test.options.map((option, i) => {
        const percentage = test.totalVotes
          ? Math.round((test.votes[i] / test.totalVotes) * 100)
          : 0;
        return (
          <div key={i}>
            <div className="vote-bar-label">
              <span>
                <span className="tiny-letter">{i ? "B" : "A"}</span>
                {option.title}
              </span>
              <strong>
                <AnimatedNumber value={percentage} suffix="%" />
                <small>
                  {test.votes[i]} {test.votes[i] === 1 ? "vote" : "votes"}
                </small>
              </strong>
            </div>
            <div className="vote-track">
              <div style={{ width: `${percentage}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Verdict({ test }) {
  const { verdict } = test;
  const winner = verdict.actual;
  const predicted = verdict.predicted;
  return (
    <section className="verdict-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">03 / THE DECISION</div>
          <h2>The audience has spoken.</h2>
        </div>
        <Button className="subtle print-button" onClick={() => window.print()}>
          <Printer size={15} />
          Print report
        </Button>
      </div>
      <div className="panel verdict-panel">
        <div className="verdict-main">
          <span className="eyebrow">
            {test.isPairedComparison
              ? `Paired case: ${verdict.paired.status}`
              : winner === null
                ? test.totalVotes
                  ? "NO CLEAR WINNER"
                  : "NO VOTES COLLECTED"
                : "AUDIENCE PICK"}
          </span>
          <h3>
            {winner === null
              ? test.totalVotes
                ? "An even split."
                : "No verdict yet."
              : test.options[winner].title}
          </h3>
          <div className="verdict-number">
            {verdict.share !== null ? (
              <AnimatedNumber value={verdict.share} suffix="%" />
            ) : (
              "—"
            )}
          </div>
          <p>
            {winner === null
              ? "A new poll can help clarify the decision."
              : `of voters chose Option ${winner ? "B" : "A"}`}
          </p>
          <span className="agreement-label">
            <CheckCircle2 size={15} />
            {test.isPairedComparison
              ? verdict.paired.status === "EVALUABLE"
                ? "See both branch results above"
                : "More evidence needed"
              : winner === null
                ? "More evidence needed"
                : predicted === null
                  ? "Prediction was too close to call"
                  : winner === predicted
                    ? "Prediction matched the poll"
                    : "Poll challenged the prediction"}
          </span>
        </div>
        {!test.isPairedComparison && (
          <div className="verdict-comparison">
            <div className="comparison-heading">
              <span>PREDICTED FIT</span>
              <span>ACTUAL VOTE</span>
            </div>
            {test.options.map((o, i) => (
              <div className="comparison-row" key={i}>
                <span>
                  <span className="tiny-letter">{i ? "B" : "A"}</span>
                  {o.title}
                </span>
                <strong>
                  {test.prediction[i].score}
                  <small>/100</small>
                </strong>
                <strong>
                  {test.totalVotes
                    ? Math.round((test.votes[i] / test.totalVotes) * 100)
                    : 0}
                  <small>%</small>
                </strong>
              </div>
            ))}
            <div className="verdict-meta">
              <span>{test.totalVotes} total votes</span>
              <span>Poll closed</span>
            </div>
          </div>
        )}
      </div>
      <div className="recommendation">
        <span className="recommendation-icon">
          <Sparkles size={18} />
        </span>
        <div>
          <h3>Your next move</h3>
          <p>{verdict.recommendation}</p>
        </div>
      </div>
    </section>
  );
}
function TestView({ id, sample = false }) {
  const [test, setTest] = useState(null);
  const [liveSample, setLiveSample] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [view, setView] = useState(
    new URLSearchParams(location.search).get("view") || "verdict",
  );
  const owner = !sample && !!getLocal(ownerKey(id));
  const refresh = () =>
    api(sample ? "/sample" : `/tests/${id}`, {
      headers: { "x-owner-token": getLocal(ownerKey(id), "") },
    });
  useEffect(() => {
    if (!sample) return;
    let current = true;
    const update = () =>
      api("/sample-live")
        .then((data) => {
          if (current) setLiveSample(data);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    update();
    const timer = setInterval(update, 2000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [sample]);
  useEffect(() => {
    let current = true;
    setTest(null);
    setError("");
    refresh()
      .then((data) => {
        if (current) setTest(data);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [id, sample]);
  useEffect(() => {
    if (!test || test.closedAt || sample) return;
    let current = true;
    const timer = setInterval(
      () =>
        refresh()
          .then((data) => {
            if (current) {
              setTest(data);
              setError("");
            }
          })
          .catch((e) => {
            if (current) setError(`Live updates interrupted: ${e.message}`);
          }),
      2000,
    );
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [id, sample, !!test, test?.closedAt]);
  const shareUrl = `${location.origin}/poll/${id}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy the poll URL from the field below.");
    }
  }
  async function closeTest() {
    setBusy(true);
    setError("");
    try {
      const data = await api(`/tests/${id}/close`, {
        method: "POST",
        headers: { "x-owner-token": getLocal(ownerKey(id), "") },
      });
      setTest(data);
      setView("verdict");
      setConfirmClose(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function openPoll() {
    if (!test.isPairedComparison && !test.freezeRequired)
      return setView("verdict");
    setBusy(true);
    setError("");
    try {
      const data = await api(`/tests/${id}/open`, {
        method: "POST",
        headers: { "x-owner-token": getLocal(ownerKey(id), "") },
      });
      setTest(data);
      setView("verdict");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!test)
    return (
      <main className="container loading-state">
        {error ? (
          <>
            <ErrorMessage>{error}</ErrorMessage>
            <Button onClick={() => navigate("/")}>Back to sample</Button>
          </>
        ) : (
          <>
            <Loader2 className="spin" size={24} />
            <p>Loading the test…</p>
          </>
        )}
      </main>
    );
  const activePrediction =
    !sample &&
    !test.closedAt &&
    (test.freezeRequired
      ? !test.pollOpenedAt
      : view === "prediction" ||
        (test.isPairedComparison && !test.pollOpenedAt));
  return (
    <main className={`container ${activePrediction ? "prediction-view" : ""}`}>
      <Steps active={activePrediction ? 1 : 2} />
      {sample && (
        <div className="sample-banner">
          <div>
            <span className="sample-tag">EXAMPLE TEST</span>
            <span>A complete test, from hunch to verdict.</span>
          </div>
          <a
            href="/create"
            onClick={(e) => {
              e.preventDefault();
              navigate("/create");
            }}
          >
            Try your own idea <Plus size={14} />
          </a>
        </div>
      )}
      <div className="page-heading experiment-heading">
        <div className="experiment-title">
          <div className="test-meta">
            <span className={`status-tag ${test.closedAt ? "" : "live"}`}>
              {test.closedAt ? <CheckCircle2 size={12} /> : <Radio size={12} />}
              {test.closedAt
                ? "Completed"
                : test.isPairedComparison && !test.pollOpenedAt
                  ? "Predictions locked"
                  : test.freezeRequired
                    ? test.lifecycle
                    : "Live test"}
            </span>
            <span>
              {sample
                ? "Bloomington, IN · Independent cafe"
                : `${test.seeds.length} taste seeds · Created ${new Date(test.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </span>
          </div>
          <h1>
            {sample ? (
              <>
                Which poster
                <br />
                <span className="heading-muted">gets them in?</span>
              </>
            ) : (
              test.title
            )}
          </h1>
          <p>
            {sample
              ? "Two creative directions. One taste-defined audience. A decision backed by votes."
              : activePrediction
                ? "Your hypothesis is ready. Now put it in front of real people."
                : "See what your audience chooses, then make the call."}
          </p>
          {sample && (
            <div className="hero-actions">
              <Button
                className="primary"
                disabled={!liveSample}
                onClick={() => navigate(`/poll/${liveSample.id}`)}
              >
                Sample — live, vote here
              </Button>
              <Button className="primary" onClick={() => navigate("/create")}>
                <Plus size={16} />
                Create a test
              </Button>
            </div>
          )}
        </div>
        <TasteMap seeds={test.seeds} />
      </div>
      <Audience test={test} />
      {sample && (
        <div className="live-sample-note">
          <strong>
            Live twin · {liveSample?.totalVotes ?? "…"} visitor votes
          </strong>
          <span>
            Try the same A/B poll. It stays open; its visitor votes are separate
            from the completed 52-vote synthetic example below.
          </span>
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {test.isPairedComparison ? (
        <AiComparison test={test} />
      ) : test.prediction ? (
        <Prediction test={test} />
      ) : (
        <p className="panel">
          Predictions remain private until the poll closes.
        </p>
      )}
      <FreezePanel test={test} owner={owner} onFrozen={setTest} />
      {activePrediction ? (
        <div className="next-panel">
          <div>
            <h2>A prediction is a starting point.</h2>
            <p>Invite your audience to vote and see if the signal holds up.</p>
          </div>
          <Button
            className="primary"
            busy={busy}
            disabled={
              (test.isPairedComparison && !owner) ||
              (test.freezeRequired && (!owner || !test.frozenAt))
            }
            onClick={openPoll}
          >
            <Radio size={16} />
            Open live poll
          </Button>
        </div>
      ) : (
        <>
          <section className="poll-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">02 / THE REALITY CHECK</div>
                <h2>
                  {test.closedAt
                    ? "What people actually picked"
                    : "Let your audience make the call"}
                </h2>
              </div>
              <span className="vote-count">
                {test.totalVotes} {test.totalVotes === 1 ? "vote" : "votes"}
                {!test.closedAt && <span className="live-dot" />}
              </span>
            </div>
            <div className="panel poll-results">
              {test.totalVotes ? (
                <VoteBars test={test} />
              ) : (
                <div className="poll-empty">
                  <span className="empty-icon">
                    <Radio size={22} />
                  </span>
                  <h3>Your first vote starts the story.</h3>
                  <p>
                    Send the poll to your audience. Results will appear here as
                    they vote.
                  </p>
                </div>
              )}
              {!test.closedAt && (
                <div className="share-panel">
                  <label htmlFor="poll-link">
                    <Link2 size={14} />
                    Your audience link
                  </label>
                  <div className="share-input">
                    <input id="poll-link" value={shareUrl} readOnly />
                    <Button className="subtle" onClick={copyLink}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                    <a
                      className="icon-link"
                      aria-label="Open poll"
                      href={shareUrl}
                    >
                      <ExternalLink size={17} />
                    </a>
                  </div>
                  <p>
                    {test.isLiveSample
                      ? "This live demo stays open. Visitor votes are separate from the completed synthetic example."
                      : "Anyone with the link can vote. Only the creating browser can close this test."}
                  </p>
                </div>
              )}
            </div>
            {owner && !test.closedAt && (
              <div className="close-panel">
                {confirmClose ? (
                  <>
                    <p>
                      Close this poll? Voting will stop and the final report
                      will be revealed.
                    </p>
                    <div>
                      <Button
                        className="subtle"
                        onClick={() => setConfirmClose(false)}
                      >
                        Keep it open
                      </Button>
                      <Button
                        className="primary"
                        busy={busy}
                        onClick={closeTest}
                      >
                        Close & reveal verdict
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      Ready to decide? Close the poll when you have enough
                      responses.
                    </p>
                    <Button
                      className="subtle"
                      onClick={() => setConfirmClose(true)}
                    >
                      Close test
                    </Button>
                  </>
                )}
              </div>
            )}
          </section>
          {test.closedAt && <Verdict test={test} />}
        </>
      )}
      <footer className="report-footer">
        <span>TasteTest A/B</span>
        <p>
          {test.isPairedComparison
            ? "Two locked AI predictions · same model · real Qloo context"
            : test.mode === "real"
              ? "Real Qloo API affinities · local heuristic fit"
              : "Synthetic Qloo-style signals"}{" "}
          · {sample ? "Illustrative sample votes" : "Anonymous audience votes"}{" "}
          ·
          {test.mode === "real"
            ? "Not a calibrated vote prediction"
            : "No real Qloo API calls for this example"}
        </p>
      </footer>
    </main>
  );
}
function PollPage({ id }) {
  const [test, setTest] = useState(null);
  const [error, setError] = useState("");
  const [voting, setVoting] = useState(null);
  const [voted, setVoted] = useState(getLocal(`tastetest-vote-${id}`));
  useEffect(() => {
    let current = true;
    const refresh = () =>
      api(`/tests/${id}`)
        .then((data) => {
          if (current) {
            setTest(data);
            setError("");
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [id]);
  async function vote(option) {
    setVoting(option);
    setError("");
    try {
      let voterId = getLocal("tastetest-voter");
      if (!voterId) {
        voterId = crypto.randomUUID();
        if (!saveLocal("tastetest-voter", voterId))
          throw new Error("Allow browser storage to cast one vote.");
      }
      const data = await api(`/tests/${id}/vote`, {
        method: "POST",
        body: JSON.stringify({ option, voterId }),
      });
      saveLocal(`tastetest-vote-${id}`, String(option));
      setVoted(String(option));
      setTest(data);
    } catch (e) {
      setError(e.message);
      if (e.message.includes("already voted")) {
        setVoted("recorded");
        saveLocal(`tastetest-vote-${id}`, "recorded");
      }
    } finally {
      setVoting(null);
    }
  }
  if (!test)
    return (
      <main className="poll-container loading-state">
        {error ? (
          <ErrorMessage>{error}</ErrorMessage>
        ) : (
          <Loader2 size={24} className="spin" />
        )}
      </main>
    );
  return (
    <main className="poll-container">
      <div className="eyebrow">
        {test.closedAt ? "POLL CLOSED" : "ONE QUICK PICK"}
      </div>
      <h1>
        {test.closedAt
          ? "The results are in."
          : voted !== null
            ? "You’re part of the decision."
            : "Which one speaks to you?"}
      </h1>
      <p className="poll-intro">
        {test.closedAt
          ? "Thanks for helping shape the next move."
          : voted !== null
            ? "Your vote is in. Here’s where the audience stands."
            : "Pick the idea you’d be more likely to try. No signup needed."}
      </p>
      <ErrorMessage>{error}</ErrorMessage>
      {(test.isPairedComparison || test.freezeRequired) &&
        !test.pollOpenedAt &&
        !test.closedAt && (
          <p className="panel">
            Predictions are locked. The creating browser has not opened voting
            yet.
          </p>
        )}
      {voted !== null && !test.closedAt && (
        <div className="voted-message">
          <CheckCircle2 size={18} />
          Vote recorded. Thanks for weighing in.
        </div>
      )}
      <div className="poll-choices">
        {test.options.map((option, i) => (
          <button
            key={i}
            disabled={
              voted !== null ||
              !!test.closedAt ||
              voting !== null ||
              ((test.isPairedComparison || test.freezeRequired) &&
                !test.pollOpenedAt)
            }
            className={`panel poll-choice ${voted === String(i) ? "your-vote" : ""}`}
            onClick={() => vote(i)}
          >
            <div className="panel-heading">
              <span className="option-letter">{i ? "B" : "A"}</span>
              {voted === String(i) ? (
                <span className="your-pick">
                  <Check size={13} />
                  Your pick
                </span>
              ) : null}
            </div>
            <OptionImage option={option} />
            <h2>{option.title}</h2>
            <p>{option.description}</p>
            {voted === null && !test.closedAt && (
              <span className="vote-cta">
                {voting === i ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  "Choose this idea"
                )}
              </span>
            )}
          </button>
        ))}
      </div>
      {(voted !== null || test.closedAt) && (
        <section className="panel mobile-results">
          <div className="section-heading">
            <h2>Audience votes</h2>
            <span>{test.totalVotes} total</span>
          </div>
          <VoteBars test={test} />
        </section>
      )}
      {test.closedAt && (
        <div className="poll-verdict">
          <p>{test.verdict.recommendation}</p>
          <Button className="subtle" onClick={() => navigate(`/test/${id}`)}>
            See the full report
          </Button>
        </div>
      )}
      <p className="poll-footnote">
        Anonymous · One vote per browser ·{" "}
        {test.closedAt ? "Voting has ended" : "Results update automatically"}
      </p>
    </main>
  );
}
function App() {
  const [config, setConfig] = useState({ mode: "loading", configured: false });
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch(() => setConfig({ mode: "unavailable", configured: false }));
  }, []);
  const route = useRoute();
  const match = route.match(/^\/(test|poll)\/([a-f0-9-]{36})$/);
  return (
    <>
      <Header mode={config.mode} configured={config.configured} />
      {[
        "/benchmark-lab/historical-case-01",
        "/case-study/cookie-cats",
      ].includes(route) ? (
        <CaseStudy />
      ) : route === "/benchmark" ? (
        <Benchmark />
      ) : ["/create", "/benchmark/new"].includes(route) ? (
        <CreateTest
          mode={config.mode}
          aiConfig={config.ai}
          configured={config.configured}
        />
      ) : match ? (
        match[1] === "poll" ? (
          <PollPage key={route} id={match[2]} />
        ) : (
          <TestView key={route} id={match[2]} />
        )
      ) : route === "/" ? (
        <TestView sample id="sample" />
      ) : (
        <main className="container loading-state">
          <h1>That page isn’t here.</h1>
          <Button onClick={() => navigate("/")}>Back to TasteTest</Button>
        </main>
      )}
      <footer className="evidence-footer">
        <span>Evidence & methodology</span>
        <a
          href="/benchmark"
          onClick={(event) => {
            event.preventDefault();
            navigate("/benchmark");
          }}
        >
          Benchmark
        </a>
        <a
          href="/benchmark-lab/historical-case-01"
          onClick={(event) => {
            event.preventDefault();
            navigate("/benchmark-lab/historical-case-01");
          }}
        >
          Benchmark lab · Historical case 01 ↗
        </a>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
