import React, { useCallback, useEffect, useRef, useState } from "react";
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
  ArrowRight,
  Link2,
  Moon,
  Sun,
} from "lucide-react";
import "./styles.css";
import "./lab.css";
import "./finish.css";
import "./theme.css";
import { toPng } from "html-to-image";
import { TasteFlow } from "./interactions.jsx";
import CaseStudy from "./CaseStudy.jsx";
import AiComparison from "./AiComparison.jsx";
import Benchmark from "./Benchmark.jsx";
import FreezePanel, { ManualFields } from "./FreezePanel.jsx";
import ProxyCase from "./ProxyBenchmark.jsx";
import MusicCase from "./MusicProxy.jsx";
import FAQ from "./FAQ.jsx";
import VerdictInsights from "./VerdictInsights.jsx";
import VerdictChat from "./VerdictChat.jsx";
import PredictionStepFeed from "./PredictionStepFeed.jsx";
import HeroQuestionRotator from "./HeroQuestionRotator.jsx";
import OptionEntityPicker from "./OptionEntityPicker.jsx";
import TestContextMeter from "./TestContextMeter.jsx";
import PollShareCard, { VoteGoal } from "./PollShareCard.jsx";
import { normalizedOutcomeMargin } from "./verdictReport.mjs";
import {
  beginPredictionStep,
  clonePredictionWork,
  createPredictionWork,
  failPredictionStep,
} from "../shared/predictionWork.mjs";
import { predictionConfidence } from "../shared/confidence.mjs";
import {
  PageSignalContext,
  usePageSignal,
  pageSignalLabel,
} from "./PageSignal.jsx";

const categoryIcons = {
  Music: Disc3,
  "Film/TV": Film,
  Dining: Utensils,
  Brands: Tag,
  Books: BookOpen,
};
const THEME_KEY = "tastetest-theme";
const REMIX_DRAFT_KEY = "tastetest-remix-draft";
function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be unavailable in privacy modes; the dark product theme remains.
  }
  return "dark";
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
applyTheme(readTheme());
const seedGuidance = {
  Music: "Search for an artist your audience actually likes.",
  "Film/TV":
    "Search for a specific movie title. Studios such as A24 belong in Brands, not movie-title search.",
  Dining:
    "Search for a named cafe or restaurant your audience actually likes. Results are individual venues, not general tastes such as independent coffee shops. Check the address and select the exact location they like.",
  Brands:
    "Search for a named brand or studio, such as A24. Select the entity returned by Qloo; a brand is not interchangeable with one of its films.",
  Books: "Search for a specific book title your audience actually likes.",
};
function seedCaption(entity) {
  const kind =
    entity.category === "Dining"
      ? "Venue"
      : entity.category === "Brands"
        ? "Brand / studio"
        : entity.category === "Music"
          ? "Artist"
          : entity.category === "Books"
            ? "Book"
            : "Movie";
  return [kind, entity.releaseYear, entity.locationLabel]
    .filter(Boolean)
    .join(" · ");
}
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Please try again.");
    error.predictionWork = data.predictionWork;
    throw error;
  }
  return data;
}
function navigate(url) {
  const target = new URL(url, window.location.origin);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = `${target.pathname}${target.search}${target.hash}`;
  if (current === next) {
    window.history.replaceState({}, "", next);
  } else {
    window.history.pushState({}, "", next);
  }
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  window.dispatchEvent(new Event("popstate"));
}
function useRoute() {
  const [routeState, setRouteState] = useState(() => ({
    path: window.location.pathname,
    navigationId: 0,
  }));
  useEffect(() => {
    const update = () =>
      setRouteState((current) => ({
        path: window.location.pathname,
        navigationId: current.navigationId + 1,
      }));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return routeState;
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
    <span
      className="chip"
      title={[entity.name, entity.locationLabel].filter(Boolean).join(" · ")}
    >
      <Icon size={13} />
      <span className="chip-text">
        {entity.name}
        {onRemove && entity.locationLabel && (
          <small>{entity.locationLabel}</small>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${[entity.name, entity.locationLabel].filter(Boolean).join(" · ")}`}
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
function Header({ label }) {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The toggle still works for the current page when storage is unavailable.
    }
  }, [theme]);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a
          className="brand"
          href="/"
          aria-label="TasteTest A/B — Home"
          title="Back to home"
        >
          <span className="brand-mark">
            <BarChart3 size={20} />
          </span>
          TasteTest<span className="brand-ab">A/B</span>
        </a>
        <div className="header-right">
          {label && (
            <a
              className="mock-pill"
              href="/faq#data-sources"
              aria-label={`${label}. Read the data-source explanation`}
              title="Read the data-source explanation"
            >
              {label}
              <CircleHelp size={14} aria-hidden="true" />
            </a>
          )}
          <button
            className="theme-toggle"
            type="button"
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <a
            className="header-cases"
            href="/benchmark"
            onClick={(event) => {
              event.preventDefault();
              navigate("/benchmark");
            }}
          >
            Explore cases
          </a>
          <a href="/create" className="header-new">
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

const heroPromptExamples = [
  ["Two poster designs", "Minimal poster vs Colorful poster"],
  ["Two menu specials", "Phở gà vs Bún chả"],
  ["Two event themes", "Acoustic night vs Dance party"],
];

function splitHeroDecision(prompt) {
  const withAudienceHint = (optionA, rawOptionB) => {
    const markerPattern = /\s+(?:dành cho|for|cho)\s+/gi;
    let marker;
    let lastMarker = null;
    while ((marker = markerPattern.exec(rawOptionB))) lastMarker = marker;
    if (lastMarker) {
      const audience = rawOptionB
        .slice(lastMarker.index + lastMarker[0].length)
        .trim();
      const optionB = rawOptionB.slice(0, lastMarker.index).trim();
      if (optionB && audience.split(/\s+/u).length >= 2)
        return { optionA, optionB, audience };
    }
    return { optionA, optionB: rawOptionB };
  };

  const dashSeparator = prompt.indexOf(" - ");
  if (dashSeparator > 0) {
    const optionA = prompt.slice(0, dashSeparator).trim();
    const remainder = prompt.slice(dashSeparator + 3).trim();
    const contextSeparator = remainder.search(/\s+[—–]\s+/);
    const optionB = (
      contextSeparator >= 0 ? remainder.slice(0, contextSeparator) : remainder
    ).trim();
    if (optionA && optionB) return withAudienceHint(optionA, optionB);
  }

  const separator = prompt.match(/\s+(?:vs\.?|or|hay|hoặc)\s+/i);
  if (separator?.index === undefined) return null;
  const optionA = prompt.slice(0, separator.index).trim();
  const optionB = prompt.slice(separator.index + separator[0].length).trim();
  return optionA && optionB ? withAudienceHint(optionA, optionB) : null;
}

function HeroPromptInput() {
  const [value, setValue] = useState("");
  const [emptySubmit, setEmptySubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const navigationTimerRef = useRef(null);

  useEffect(() => {
    const focusPrompt = (event) => {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) ||
        document.activeElement?.isContentEditable
      )
        return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", focusPrompt);
    return () => window.removeEventListener("keydown", focusPrompt);
  }, []);

  useEffect(() => () => window.clearTimeout(navigationTimerRef.current), []);

  function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const prompt = value.trim();
    if (!prompt) {
      setEmptySubmit(true);
      inputRef.current?.focus();
      return;
    }

    const split = splitHeroDecision(prompt);
    let destination = `/create?prompt=${encodeURIComponent(prompt)}`;
    if (split) {
      destination = `/create?optionA=${encodeURIComponent(split.optionA)}&optionB=${encodeURIComponent(split.optionB)}${split.audience ? `&audience=${encodeURIComponent(split.audience)}` : ""}`;
    }

    setSubmitting(true);
    navigationTimerRef.current = window.setTimeout(
      () => navigate(destination),
      500,
    );
  }

  return (
    <form
      className={`hero-prompt${emptySubmit ? " is-empty" : ""}`}
      onSubmit={submit}
      onAnimationEnd={() => setEmptySubmit(false)}
      aria-busy={submitting}
    >
      <label className="hero-prompt-label" htmlFor="hero-decision">
        <span>Start with your decision</span>
        <kbd>/</kbd>
      </label>
      <div className="hero-prompt-field">
        <input
          id="hero-decision"
          ref={inputRef}
          value={value}
          disabled={submitting}
          onChange={(event) => {
            setValue(event.target.value);
            setEmptySubmit(false);
          }}
          placeholder="Describe your A/B decision…"
          maxLength={100}
        />
        <button
          type="submit"
          aria-label="Create a test from this decision"
          disabled={submitting}
        >
          {submitting ? (
            <Loader2 size={20} className="spin" aria-hidden="true" />
          ) : (
            <ArrowRight size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      {submitting && (
        <small className="hero-prompt-status" role="status">
          Setting up your test…
        </small>
      )}
      <div className="hero-prompt-examples" aria-label="Example decisions">
        {heroPromptExamples.map(([label, example]) => (
          <button
            type="button"
            key={label}
            disabled={submitting}
            onClick={() => {
              setValue(example);
              setEmptySubmit(false);
              inputRef.current?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </form>
  );
}

function HeroLivePoll({ test, onUpdate }) {
  const [voted, setVoted] = useState(null);
  const [voting, setVoting] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setVoted(test ? getLocal(`tastetest-vote-${test.id}`) : null);
  }, [test?.id]);

  if (!test) return null;

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
      const data = await api(`/tests/${test.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ option, voterId }),
      });
      saveLocal(`tastetest-vote-${test.id}`, String(option));
      setVoted(String(option));
      onUpdate(data);
    } catch (caught) {
      setError(caught.message);
      if (caught.message.includes("already voted")) {
        setVoted("recorded");
        saveLocal(`tastetest-vote-${test.id}`, "recorded");
      }
    } finally {
      setVoting(null);
    }
  }

  return (
    <section className="hero-live-poll" aria-label="Live sample poll">
      <div className="hero-live-poll-heading">
        <span>
          LIVE SAMPLE · {test.totalVotes}{" "}
          {test.totalVotes === 1 ? "VOTE" : "VOTES"}
        </span>
        <a
          href={`/poll/${test.id}`}
          onClick={(event) => {
            event.preventDefault();
            navigate(`/poll/${test.id}`);
          }}
        >
          See results →
        </a>
      </div>
      <p>
        {voted === null
          ? "Which poster would pull you in?"
          : "Your vote is in."}
      </p>
      <div className="hero-live-poll-options">
        {test.options.map((option, index) => (
          <button
            type="button"
            key={option.title}
            disabled={voted !== null || voting !== null}
            className={voted === String(index) ? "is-picked" : ""}
            onClick={() => vote(index)}
          >
            {option.imageUrl && (
              <img
                className="hero-live-poll-thumb"
                src={option.imageUrl}
                alt=""
                aria-hidden="true"
                loading="eager"
              />
            )}
            <span>{index ? "B" : "A"}</span>
            <strong>{option.title}</strong>
            {voting === index && <Loader2 size={14} className="spin" />}
          </button>
        ))}
      </div>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}

function readRemixDraft() {
  if (new URLSearchParams(window.location.search).get("remix") !== "sample")
    return null;
  try {
    const draft = JSON.parse(sessionStorage.getItem(REMIX_DRAFT_KEY));
    return draft?.options?.length === 2 && Array.isArray(draft.seeds)
      ? draft
      : null;
  } catch {
    return null;
  }
}

function CreateTest({ mode }) {
  const createParams = new URLSearchParams(window.location.search);
  const promptPrefill = createParams.get("prompt")?.trim().slice(0, 100);
  const optionAPrefill =
    createParams.get("optionA")?.trim().slice(0, 100) || promptPrefill;
  const optionBPrefill = createParams.get("optionB")?.trim().slice(0, 100);
  const audiencePrefill = createParams.get("audience")?.trim().slice(0, 300);
  const hasQueryPrefill = Boolean(
    optionAPrefill || optionBPrefill || audiencePrefill,
  );
  const remixDraft = useRef(readRemixDraft()).current;
  const [creationMode, setCreationMode] = useState(
    window.location.pathname === "/benchmark/new" ? "evidence" : "quick",
  );
  const [insightCategory, setInsightCategory] = useState(
    remixDraft?.insightCategory || "Dining",
  );
  const [options, setOptions] = useState(
    remixDraft?.options || [
      { title: optionAPrefill || "", description: "", imageUrl: "" },
      { title: optionBPrefill || "", description: "", imageUrl: "" },
    ],
  );
  const [comparisonKind, setComparisonKind] = useState("concepts");
  const [optionEntities, setOptionEntities] = useState([null, null]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Music");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(
    remixDraft?.seeds?.slice(0, 5) || [],
  );
  const [note, setNote] = useState(
    remixDraft?.audienceNote || audiencePrefill || "",
  );
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [predictionWork, setPredictionWork] = useState(null);
  const [evidenceMetadata, setEvidenceMetadata] = useState({
    track:
      window.location.pathname === "/benchmark/new" ? "track-b" : "rehearsal",
    caseLabel: "",
    business: "",
    decision: "",
    channel: "",
    unpublished: false,
    audienceVerified: false,
  });
  const emptyBranch = () => ({
    pick: "A",
    confidence: 50,
    source: "",
    answer: "",
  });
  const [evidenceBranches, setEvidenceBranches] = useState({
    llm: emptyBranch(),
    qloo: emptyBranch(),
    agent: emptyBranch(),
  });
  const [originalRecordedAt, setOriginalRecordedAt] = useState("");
  const [beforeOutcome, setBeforeOutcome] = useState(false);
  const studioQuery =
    mode === "real" &&
    category === "Film/TV" &&
    /^a\s*24(?:\s+films)?$/i.test(query.trim());
  const broadDiningQuery =
    mode === "real" &&
    category === "Dining" &&
    /^(?:independent|local|specialty|artisan(?:al)?|indie)\s+(?:coffee(?:\s+shops?)?|caf[eé]s?)$/i.test(
      query.trim(),
    );
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
    if (field === "title")
      setOptionEntities((old) =>
        old.map((entity, i) => (i === index ? null : entity)),
      );
    setOptions((old) =>
      old.map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    );
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (
      creationMode === "quick" &&
      comparisonKind === "entities" &&
      optionEntities.some((entity) => !entity)
    ) {
      setError(
        "Confirm the exact Qloo entity for both Option A and Option B before predicting.",
      );
      return;
    }
    if (selected.length < 3) {
      setError(
        "Choose at least 3 taste seeds so the audience has enough context.",
      );
      return;
    }
    setBusy(true);
    const work = createPredictionWork({
      mode,
      context: creationMode === "quick" ? "quick-test" : "track-b",
    });
    beginPredictionStep(work, "resolve-seeds");
    setPredictionWork(clonePredictionWork(work));
    try {
      const data = await api("/tests", {
        method: "POST",
        body: JSON.stringify({
          options: options.map((option, index) => ({
            ...option,
            ...(creationMode === "quick" && comparisonKind === "entities"
              ? { entityId: optionEntities[index].entity_id }
              : {}),
          })),
          comparisonKind:
            creationMode === "quick" ? comparisonKind : "concepts",
          seedEntityIds: selected.map((e) => e.entity_id),
          audienceNote: note,
          insightCategory,
          creationMode,
          compareAi: creationMode === "quick",
          benchmarkMetadata:
            creationMode === "evidence"
              ? evidenceMetadata
              : { track: "rehearsal" },
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
      if (creationMode === "evidence") {
        await api(`/tests/${data.test.id}/freeze`, {
          method: "POST",
          headers: { "x-owner-token": data.ownerToken },
          body: JSON.stringify({
            mode: "manual",
            originalRecordedAt: new Date(originalRecordedAt).toISOString(),
            llm: evidenceBranches.llm,
            qloo: evidenceBranches.qloo,
            agent: evidenceBranches.agent,
            metadata: evidenceMetadata,
            beforeOutcome,
          }),
        });
      }
      navigate(`/test/${data.test.id}?view=prediction`);
    } catch (e) {
      setError(e.message);
      if (e.predictionWork) setPredictionWork(e.predictionWork);
      else {
        failPredictionStep(
          work,
          "resolve-seeds",
          "Couldn't start the prediction workflow. No prediction was recorded.",
        );
        setPredictionWork(clonePredictionWork(work));
      }
    } finally {
      setBusy(false);
    }
  }
  const readyOptions = options.filter(
    (option, index) =>
      option.title.trim() &&
      option.description.trim() &&
      (creationMode !== "quick" ||
        comparisonKind !== "entities" ||
        optionEntities[index]),
  ).length;
  const remainingSeeds = Math.max(0, 3 - selected.length);
  const readiness = `${readyOptions}/2 options ready · ${remainingSeeds ? `${remainingSeeds} more audience ${remainingSeeds === 1 ? "taste" : "tastes"} needed` : `${selected.length} audience tastes selected`}`;
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
        <div className="creation-mode-control">
          <div
            className="segmented-control"
            role="group"
            aria-label="Creation mode"
          >
            <button
              type="button"
              className={creationMode === "quick" ? "selected" : ""}
              aria-pressed={creationMode === "quick"}
              onClick={() => setCreationMode("quick")}
            >
              Quick test
            </button>
            <button
              type="button"
              className={creationMode === "evidence" ? "selected" : ""}
              aria-pressed={creationMode === "evidence"}
              onClick={() => setCreationMode("evidence")}
            >
              Record as evidence
            </button>
          </div>
          <p>
            {creationMode === "quick"
              ? "Describe two ideas, choose audience tastes, then lock a prediction before voting. Quick tests stay outside the evidence benchmark."
              : "For the live evidence benchmark (Track B): freeze all branch records before polling and collect at least 20 real, non-tied votes."}
          </p>
        </div>
        {creationMode === "quick" && (
          <div className="qloo-comparison-mode">
            <div
              className="segmented-control"
              role="group"
              aria-label="Option type"
            >
              <button
                type="button"
                aria-pressed={comparisonKind === "concepts"}
                className={comparisonKind === "concepts" ? "selected" : ""}
                onClick={() => setComparisonKind("concepts")}
              >
                Custom ideas
              </button>
              <button
                type="button"
                aria-pressed={comparisonKind === "entities"}
                className={comparisonKind === "entities" ? "selected" : ""}
                disabled={mode !== "real"}
                onClick={() => setComparisonKind("entities")}
              >
                Known items in Qloo
              </button>
            </div>
            <p className="muted">
              {comparisonKind === "entities"
                ? "Compare two confirmed artists, movies, venues, brands or books using direct Qloo affinity."
                : "For posters, menu concepts or events: Qloo supplies audience signals and the Agent evaluates your descriptions."}
            </p>
            {comparisonKind === "entities" && (
              <>
                <label htmlFor="qloo-option-category">Item category</label>
                <select
                  id="qloo-option-category"
                  value={insightCategory}
                  onChange={(event) => {
                    setInsightCategory(event.target.value);
                    setOptionEntities([null, null]);
                  }}
                >
                  {Object.keys(categoryIcons).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
        {(hasQueryPrefill || remixDraft) && (
          <div className="prefill-note" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <div>
              <strong>
                {remixDraft
                  ? "The demo is ready to remix."
                  : optionAPrefill && optionBPrefill
                    ? "Both options are ready to edit."
                    : "Your decision is ready to edit."}
              </strong>
              <span>
                {remixDraft
                  ? "Both options and the demo audience are copied into this draft."
                  : optionAPrefill && optionBPrefill
                    ? "We split your decision into Option A and Option B. Add details and choose the audience below."
                    : "We carried it into Option A. Add the competing option and audience below."}
              </span>
            </div>
          </div>
        )}
        <p className="option-description-guidance">
          Give each option a name and one sentence describing what makes it
          different.
        </p>
        <TestContextMeter
          options={options}
          seeds={selected}
          note={note}
          entities={optionEntities}
          direct={creationMode === "quick" && comparisonKind === "entities"}
          automatic={creationMode === "quick"}
          mode={mode}
        />
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
                maxLength={1200}
                rows={4}
              />
              {creationMode === "quick" && comparisonKind === "entities" && (
                <OptionEntityPicker
                  label={i ? "B" : "A"}
                  title={option.title}
                  category={insightCategory}
                  selected={optionEntities[i]}
                  onSelect={(entity) => {
                    setOptionEntities((old) =>
                      old.map((current, index) =>
                        index === i ? entity : current,
                      ),
                    );
                    setOptions((old) =>
                      old.map((current, index) =>
                        index === i
                          ? { ...current, title: entity.name }
                          : current,
                      ),
                    );
                  }}
                  onClear={() =>
                    setOptionEntities((old) =>
                      old.map((current, index) =>
                        index === i ? null : current,
                      ),
                    )
                  }
                />
              )}
              <details
                className="option-image-details"
                open={option.imageUrl ? true : undefined}
              >
                <summary>
                  Add an image{" "}
                  <span className="optional">optional · display only</span>
                </summary>
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
              </details>
            </section>
          ))}
        </div>
        <section className="panel audience-panel">
          <div className="section-heading">
            <div>
              <h2>Who is this for?</h2>
              <p>
                Describe your audience, then choose 3–5 artists, movies, places,
                brands or books they like. Mix across categories.
              </p>
            </div>
            <span
              className={`selection-count ${selected.length >= 3 ? "ready" : ""}`}
            >
              {selected.length} / 5 selected
            </span>
          </div>
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
              aria-describedby={
                mode === "real" ? "seed-search-guidance" : undefined
              }
            />
          </div>
          {mode === "real" && (
            <div className="seed-guidance" id="seed-search-guidance">
              <p>{seedGuidance[category]}</p>
              {studioQuery && (
                <div className="seed-query-help">
                  <p>
                    A24 is a studio. Switch to Brands to look it up; no film
                    will be substituted automatically.
                  </p>
                  <Button
                    type="button"
                    className="subtle"
                    onClick={() => {
                      setCategory("Brands");
                      setQuery("A24");
                    }}
                  >
                    Search A24 in Brands
                  </Button>
                </div>
              )}
              {broadDiningQuery && (
                <div className="seed-query-help">
                  <p>
                    These matches are specific businesses, not the concept “
                    {query.trim()}”. Choose a venue only if the audience likes
                    that exact venue.
                  </p>
                  <Button
                    type="button"
                    className="subtle"
                    disabled={
                      note.includes(query.trim()) ||
                      (note + "\n" + query.trim()).length > 300
                    }
                    onClick={() =>
                      setNote((old) =>
                        [old.trim(), query.trim()].filter(Boolean).join("\n"),
                      )
                    }
                  >
                    Add concept to audience note
                  </Button>
                  <p>
                    Audience notes provide context; they do not count as
                    resolved Qloo seeds.
                  </p>
                </div>
              )}
            </div>
          )}
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
                    aria-label={[entity.name, entity.locationLabel]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() =>
                      setSelected((old) =>
                        picked
                          ? old.filter((e) => e.entity_id !== entity.entity_id)
                          : [...old, entity],
                      )
                    }
                  >
                    {picked ? <Check size={13} /> : <Plus size={13} />}
                    <span className="seed-result-text">
                      <span>{entity.name}</span>
                      {mode === "real" && (
                        <small>
                          {seedCaption(entity)}
                          {entity.category === "Dining" && !entity.locationLabel
                            ? " · location unavailable; verify this venue"
                            : ""}
                        </small>
                      )}
                    </span>
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
          {!(creationMode === "quick" && comparisonKind === "entities") && (
            <>
              <label htmlFor="insight-category">Recommendation context</label>
              <select
                id="insight-category"
                aria-label="Recommendation context"
                value={insightCategory}
                onChange={(event) => {
                  setInsightCategory(event.target.value);
                  setOptionEntities([null, null]);
                }}
              >
                {Object.keys(categoryIcons).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <p className="muted">
                {creationMode === "quick" && comparisonKind === "entities"
                  ? "This category must match both confirmed options. Changing it clears their matches."
                  : "Choose the category most relevant to your concepts. Qloo affinity comes from recommendations in this category."}
              </p>
            </>
          )}
        </section>
        <details
          className="panel prediction-method"
          open={creationMode === "evidence" ? true : undefined}
        >
          <summary>How the prediction works</summary>
          {creationMode === "quick" ? (
            <>
              <p>
                GPT-5 runs through the configured Replicate integration. Qloo
                supplies taste signals when available; Agent combines the two.
              </p>
              <p className="muted">
                All predictions are locked before the poll opens. Quick tests
                never enter the live evidence benchmark totals.
              </p>
            </>
          ) : (
            <>
              <p>
                AI-only, Qloo and Agent. Record all three branches below;
                submitting seals every pick before the poll can open.
              </p>
              <p className="muted">
                Evidence mode keeps source, timing and eligibility fields for
                the benchmark receipt.
              </p>
            </>
          )}
        </details>
        {creationMode === "evidence" && (
          <section className="panel create-evidence-fields">
            <div className="section-heading">
              <div>
                <div className="eyebrow">EVIDENCE RECORD</div>
                <h2>Record all three branches before any votes</h2>
                <p>
                  These declarations are sealed with the prediction receipt and
                  cannot be edited after submission.
                </p>
              </div>
            </div>
            <label>
              Case track
              <select
                value={evidenceMetadata.track}
                onChange={(event) =>
                  setEvidenceMetadata((old) => ({
                    ...old,
                    track: event.target.value,
                  }))
                }
              >
                <option value="rehearsal">
                  Workflow rehearsal / public case
                </option>
                <option value="track-b">
                  Live evidence (Track B) — unpublished taste case
                </option>
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
                    value={evidenceMetadata[key]}
                    maxLength={key === "caseLabel" ? 60 : 300}
                    onChange={(event) =>
                      setEvidenceMetadata((old) => ({
                        ...old,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={evidenceMetadata.unpublished}
                onChange={(event) =>
                  setEvidenceMetadata((old) => ({
                    ...old,
                    unpublished: event.target.checked,
                  }))
                }
              />
              This is a fresh unpublished case, with no public outcome.
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={evidenceMetadata.audienceVerified}
                onChange={(event) =>
                  setEvidenceMetadata((old) => ({
                    ...old,
                    audienceVerified: event.target.checked,
                  }))
                }
              />
              The planned voters actually share the recorded taste seeds.
            </label>
            <label>
              Original prediction timestamp
              <input
                type="datetime-local"
                required
                value={originalRecordedAt}
                onChange={(event) => setOriginalRecordedAt(event.target.value)}
              />
            </label>
            {[
              ["llm", "AI-only (external)"],
              ["qloo", "Qloo (external)"],
              ["agent", "Agent (external)"],
            ].map(([key, label]) => (
              <ManualFields
                key={key}
                name={label}
                tie={key !== "llm"}
                value={evidenceBranches[key]}
                update={(field, value) =>
                  setEvidenceBranches((old) => ({
                    ...old,
                    [key]: { ...old[key], [field]: value },
                  }))
                }
              />
            ))}
            <label className="check-label">
              <input
                type="checkbox"
                required
                checked={beforeOutcome}
                onChange={(event) => setBeforeOutcome(event.target.checked)}
              />
              All predictions were recorded before collecting any outcome or
              vote.
            </label>
          </section>
        )}
        <ErrorMessage>{error}</ErrorMessage>
        <PredictionStepFeed work={predictionWork} />
        <div className="form-footer">
          <div className="creation-readiness" aria-live="polite">
            <strong>{readiness}</strong>
            <p>
              <CircleHelp size={15} />
              {mode === "real"
                ? creationMode === "quick" && comparisonKind === "entities"
                  ? "Confirmed items use direct Qloo affinity. Affinity is not a vote probability."
                  : "Qloo provides audience context; custom ideas use local text scoring and Agent reasoning, not direct entity affinity."
                : "Mock taste signals help test the flow, not predict real demand."}
            </p>
          </div>
          <Button className="primary" busy={busy} type="submit">
            <Sparkles size={16} />
            {busy
              ? creationMode === "quick"
                ? "Predicting and freezing…"
                : "Preparing evidence case…"
              : creationMode === "quick"
                ? "Predict & freeze"
                : "Prepare evidence case"}
          </Button>
        </div>
      </form>
    </main>
  );
}
function ConfidenceNote({ confidence, without, mode }) {
  return (
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
          : mode === "real"
            ? "Real API signals; locally scored."
            : "Synthetic signals only."}{" "}
        Not a calibrated likelihood of being correct.
      </span>
    </div>
  );
}
function Prediction({
  test,
  compact = false,
  without,
  setWithout,
  showAudience = false,
}) {
  const scores = without ? test.baseline : test.prediction;
  const winner = winnerFor(scores);
  const confidence = predictionConfidence(scores);
  const noOptionAffinity =
    !without && scores.every((score) => !(score.components?.affinitySum > 0));
  const noSignalTie = noOptionAffinity && scores[0]?.score === scores[1]?.score;
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
      {showAudience && (
        <div className="prediction-audience">
          <Audience test={test} />
        </div>
      )}
      {!showAudience && (
        <>
          <p className="comparison-note">
            {without
              ? "Keyword baseline · exact word overlap only"
              : test.mode === "real"
                ? "Real Qloo affinities · local concept/tag-fit heuristic"
                : "Mock cultural model · synthetic affinity + shared taste tags"}
            <span>Scores indicate fit, not vote probability.</span>
          </p>
          {!without && test.provenance?.qlooFallback && (
            <span className="qloo-fallback-badge">
              Qloo: no data — heuristic fallback
            </span>
          )}
          <ConfidenceNote
            confidence={confidence}
            without={without}
            mode={test.mode}
          />
        </>
      )}
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
              <span>/ 100 fit</span>
            </div>
            <div className="score-track">
              <div
                className={`score-fill ${winner === i ? "accent" : ""}`}
                style={{ width: `${scores[i].score}%` }}
              />
            </div>
            <h3>{option.title}</h3>
            <OptionImage option={option} />
            <p className="option-description">{option.description}</p>
            <details className="reason-details">
              <summary>Why this direction</summary>
              <ul className="reason-list">
                {scores[i].reasons.map((reason) => (
                  <li key={reason}>
                    <Check size={13} />
                    {reason}
                  </li>
                ))}
              </ul>
            </details>
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
      {showAudience && (
        <details className="sample-score-context">
          <summary>How to read these scores</summary>
          <p className="comparison-note">
            {without
              ? "Keyword baseline · exact word overlap only"
              : "Mock cultural model · synthetic affinity + shared taste tags"}
            <span>Scores indicate fit, not vote probability.</span>
          </p>
          <ConfidenceNote
            confidence={confidence}
            without={without}
            mode={test.mode}
          />
        </details>
      )}
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
      {!without && noSignalTie ? (
        <div className="segment-note no-signal-note">
          <AlertTriangle size={16} />
          <div>
            <strong>
              No affinity signal for either option — prediction abstains.
            </strong>
          </div>
        </div>
      ) : !without && test.prediction.some((p) => p.warning) ? (
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
      ) : null}
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
                <span className="tiny-letter">{i ? "B" : "A"}</span>{" "}
                {option.title}
              </span>
              <strong>
                {percentage}%{" "}
                <small>
                  {test.votes[i]} {test.votes[i] === 1 ? "vote" : "votes"}
                </small>
              </strong>
            </div>
            <div className="vote-track">
              <div
                className={
                  test.votes[i] > test.votes[1 - i] ? "winning-bar" : ""
                }
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Verdict({ test, without, setWithout }) {
  const card = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const { verdict } = test;
  const winner = verdict.actual;
  const scores = without ? test.baseline : test.prediction;
  const predicted = without
    ? scores
      ? winnerFor(scores)
      : null
    : verdict.predicted;
  const fitWinner = scores ? winnerFor(scores) : null;
  const actualLetter = winner === null ? null : winner ? "B" : "A";
  const voteMargin = normalizedOutcomeMargin(test.votes, test.totalVotes);
  const fitGap = scores
    ? Math.abs(scores[0].score - scores[1].score)
    : (test.freeze?.payload?.branches?.qloo?.gap ?? null);
  const pairedBranches = test.comparison?.payload
    ? {
        llm: {
          pick: test.comparison.payload.aiOnly.choice,
          confidence: test.comparison.payload.aiOnly.confidence,
          source: test.comparison.payload.model || "Paired AI-only branch",
        },
        qloo: test.comparison.payload.qloo
          ? {
              pick: test.comparison.payload.qloo.choice,
              confidence: test.comparison.payload.qloo.confidence,
              source: test.comparison.payload.qloo.source || "Qloo branch",
              fallback: test.comparison.payload.qloo.fallback === true,
            }
          : {},
        agent: {
          pick: test.comparison.payload.aiQloo.choice,
          confidence: test.comparison.payload.aiQloo.confidence,
          source: `${test.comparison.payload.model || "Paired model"} + Qloo`,
        },
      }
    : null;
  const branches = test.freeze?.payload?.branches || pairedBranches || {};
  const grades =
    test.benchmarkResult?.grades ||
    (verdict.paired
      ? {
          llm: verdict.paired.aiOnly,
          qloo: verdict.paired.qloo,
          agent: verdict.paired.agent || verdict.paired.aiQloo,
        }
      : {});
  const freezeAt =
    test.freeze?.payload?.frozenAt ||
    test.comparison?.payload?.committedAt ||
    null;
  const receiptHash = test.freeze?.sha256 || test.comparison?.sha256 || null;
  const signalCount = Array.isArray(test.insights)
    ? test.insights.filter((signal) => Number.isFinite(signal.affinity)).length
    : 0;
  const visibleSignals = Array.isArray(test.insights)
    ? [...test.insights]
        .filter((signal) => signal.name && Number.isFinite(signal.affinity))
        .sort((a, b) => b.affinity - a.affinity)
        .slice(0, 3)
        .map((signal) => signal.name)
        .join(" · ")
    : "";
  const matchBadge =
    winner === null || predicted === null
      ? "No declared match"
      : winner === predicted
        ? "Matched"
        : "Missed";
  const grounding = `Verdict built from ${signalCount} Qloo affinity signals · ${test.totalVotes} votes · frozen ${freezeAt || "not recorded"} · SHA-256 ${receiptHash ? receiptHash.slice(0, 12) : "not recorded"}.${visibleSignals ? ` Top signals: ${visibleSignals}.` : ""}`;
  function answerSampleVerdict(question) {
    const normalized = question.toLowerCase();
    if (normalized.includes("why") || normalized.includes("pick")) {
      return `Option A had the stronger synthetic concept fit: ${test.prediction?.[0]?.score ?? "—"}/100 versus ${test.prediction?.[1]?.score ?? "—"}/100. The visible taste signals were ${visibleSignals || "not recorded"}. This is a fit-gap heuristic, not a calibrated probability.`;
    }
    if (normalized.includes("disagree") || normalized.includes("branch")) {
      return "This illustrative cafe demo recorded one concept-fit prediction only. AI-only and Qloo were not run as separate frozen branches, so there is no branch disagreement to claim.";
    }
    if (normalized.includes("change") || normalized.includes("different")) {
      return `A different audience, different taste seeds, revised poster concepts, or a different real vote split could change this verdict. In this fixed sample, Option A received ${test.votes[0]} of ${test.totalVotes} illustrative votes.`;
    }
    if (normalized.includes("confident") || normalized.includes("confidence")) {
      return `Treat the ${fitGap == null ? "recorded" : `${Math.round(fitGap)}-point`} fit gap as a heuristic description of signal separation, not a calibrated probability or proof of future accuracy.`;
    }
    return "I only know what is in this verdict: the two poster concepts, four taste seeds, visible synthetic fit signals, the concept-fit scores, and the 52 illustrative votes.";
  }
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
      link.download = `tastetest-verdict-${test.id}${without ? "-baseline" : ""}.png`;
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
    <section className="verdict-section focused-verdict">
      <div className="section-heading">
        <div>
          <div className="eyebrow">03 / THE DECISION</div>
          <h2>The audience has spoken.</h2>
        </div>
        <div className="verdict-actions">
          <Button
            className="subtle print-button"
            onClick={() => window.print()}
          >
            <Printer size={15} />
            Print report
          </Button>
          <Button className="subtle" busy={exporting} onClick={exportImage}>
            <ExternalLink size={15} />
            Share verdict image
          </Button>
          {(test.isSample ||
            test.freeze?.payload?.metadata?.track === "track-b") && (
            <button
              type="button"
              className="button subtle"
              onClick={() => {
                const chat = document.getElementById(
                  `verdict-chat-${test.isSample ? "sample-cafe-verdict" : `track-b-${test.id}`}`,
                );
                if (chat) {
                  chat.open = true;
                  chat.querySelector("summary")?.focus();
                  chat.scrollIntoView({ block: "center" });
                }
              }}
            >
              Ask about this result
            </button>
          )}
          {!test.isPairedComparison && (
            <label
              id="keyword-baseline"
              className="toggle-label verdict-toggle"
            >
              <span>Keyword baseline</span>
              <input
                type="checkbox"
                checked={without}
                onChange={(e) => setWithout(e.target.checked)}
              />
              <span className="toggle-track" aria-hidden="true" />
            </label>
          )}
        </div>
      </div>
      <div
        ref={card}
        className={`panel verdict-artefact ${without ? "baseline-view" : ""}`}
      >
        <div className="verdict-kicker">
          <span>TASTETEST / DECISION RECORD</span>
          <span>
            {without
              ? "KEYWORD BASELINE VIEW"
              : test.freeze?.payload?.metadata?.track === "track-b"
                ? `LIVE EVIDENCE / TRACK B · ${test.mode === "real" ? "QLOO DATA + LOCAL FIT" : "SYNTHETIC SIGNALS"}`
                : test.isPairedComparison
                  ? "PAIRED COMPARISON"
                  : test.mode === "real"
                    ? "QLOO DATA + LOCAL FIT"
                    : test.isSample
                      ? "SYNTHETIC CAFE EXAMPLE"
                      : "SYNTHETIC SIGNALS"}
          </span>
        </div>
        <section className="verdict-report-section verdict-report-headline">
          <div className="verdict-section-label">01</div>
          <div>
            <h2>The Verdict</h2>
            <div className="verdict-hero">
              <div className="verdict-main">
                <span className="eyebrow">
                  {winner === null ? "NO CLEAR WINNER" : "AUDIENCE PICK"}
                </span>
                <div className="verdict-number">
                  {verdict.share !== null ? (
                    <AnimatedNumber value={verdict.share} suffix="%" />
                  ) : (
                    "—"
                  )}
                </div>
                <h3>
                  {winner === null
                    ? test.totalVotes
                      ? "An even split."
                      : "No verdict yet."
                    : test.options[winner].title}
                </h3>
                <p>
                  {winner === null
                    ? "More audience evidence needed."
                    : `of voters chose Option ${winner ? "B" : "A"}`}{" "}
                  · {test.totalVotes} votes
                </p>
                <div className="verdict-headline-meta">
                  <span>
                    {voteMargin === null
                      ? "Margin unavailable"
                      : `${Math.round(voteMargin)}-point vote margin`}
                  </span>
                  <strong
                    className={`verdict-match is-${matchBadge
                      .toLowerCase()
                      .replaceAll(" ", "-")}`}
                  >
                    {matchBadge}
                  </strong>
                </div>
              </div>
              {winner !== null && (
                <div className="verdict-poster">
                  <OptionImage option={test.options[winner]} />
                </div>
              )}
            </div>
            {!test.isPairedComparison && scores && (
              <div className="verdict-bars">
                <div className="verdict-bar">
                  <div className="verdict-bar-label">
                    <span>
                      {without ? "Keyword baseline" : "Predicted fit"}
                    </span>
                    <strong>
                      {scores
                        .map((p, i) => `${i ? "B" : "A"} ${p.score}/100`)
                        .join(" · ")}
                    </strong>
                  </div>
                  <div className="paired-fit-bars">
                    {scores.map((p, i) => (
                      <div className="score-track" key={i}>
                        <div
                          className={`score-fill ${fitWinner === i ? "accent" : ""}`}
                          style={{ width: `${p.score}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <small>
                    Independent fit scores; not expected vote shares.
                  </small>
                </div>
                <div className="verdict-bar">
                  <div className="verdict-bar-label">
                    <span>Actual vote</span>
                    <strong>
                      {test.options
                        .map(
                          (_, i) =>
                            `${i ? "B" : "A"} ${test.totalVotes ? Math.round((test.votes[i] / test.totalVotes) * 100) : 0}%`,
                        )
                        .join(" · ")}
                    </strong>
                  </div>
                  <div className="actual-split">
                    {test.votes.map((v, i) => (
                      <div
                        key={i}
                        className={winner === i ? "winning-bar" : ""}
                        style={{
                          width: `${test.totalVotes ? (v / test.totalVotes) * 100 : 0}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="recommendation">
              <h3>Your next move</h3>
              <p>
                {without && !test.isPairedComparison
                  ? winner === null
                    ? "The poll has no clear winner. Refine the concepts and collect more responses before deciding."
                    : `${test.options[winner].title} received ${verdict.share}% of ${test.totalVotes} votes. Use the observed preference for a small trial, then measure real outcomes. The keyword baseline is a separate comparison; this convenience poll is not a representative study.`
                  : verdict.recommendation}
              </p>
            </div>
            <p className="calibration-line">
              {test.isPairedComparison
                ? `Paired case: ${verdict.paired.status}. See the locked branch record in Prediction.`
                : `${without ? "Baseline comparison" : "Prediction comparison"}: ${winner === null ? "more evidence needed" : predicted === null ? "too close to call" : winner === predicted ? "matched the poll" : "poll challenged the prediction"}. Fit scores are not calibrated probabilities.`}
            </p>
          </div>
        </section>
        <VerdictInsights
          branches={branches}
          grades={grades}
          actual={actualLetter}
          actualMargin={voteMargin}
          fitGap={fitGap}
          marginName="Vote margin"
          grounding={grounding}
          baselineHref={
            test.isPairedComparison
              ? "/?view=verdict#keyword-baseline"
              : "#keyword-baseline"
          }
          baselineNote={
            without
              ? "Locked branch records are unchanged; this view replaces only the headline predictor with the keyword baseline."
              : null
          }
          illustrativePick={
            test.isSample && predicted !== null
              ? predicted === 0
                ? "A"
                : "B"
              : null
          }
        />
        <div className="verdict-meta">
          <span>{test.title}</span>
          <span>
            {test.isSample
              ? "52 illustrative votes · synthetic example"
              : `Closed ${new Date(test.closedAt).toLocaleDateString()}`}
          </span>
        </div>
      </div>
      {test.freeze?.payload?.metadata?.track === "track-b" && (
        <VerdictChat
          endpoint={`/api/tests/${test.id}/chat`}
          verdictKey={`track-b-${test.id}`}
        />
      )}
      {test.isSample && (
        <VerdictChat
          verdictKey="sample-cafe-verdict"
          localAnswer={answerSampleVerdict}
        />
      )}
      {notice && (
        <p role="status" className="export-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
function TestView({ id, sample = false }) {
  const [test, setTest] = useState(null);
  usePageSignal(test);
  const [without, setWithout] = useState(false);
  const [liveSample, setLiveSample] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [view, setView] = useState(
    new URLSearchParams(location.search).get("view") ||
      (sample ? "prediction" : "verdict"),
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
  const isTrackB =
    test.benchmarkMetadata?.track === "track-b" ||
    test.freeze?.payload?.metadata?.track === "track-b";
  const recordedPick =
    test.comparison?.payload?.aiQloo?.choice ??
    test.freeze?.payload?.branches?.agent?.pick;
  const fitWinner =
    !test.isPairedComparison && test.prediction
      ? winnerFor(test.prediction)
      : undefined;
  const displayPick =
    recordedPick ??
    (fitWinner === undefined
      ? null
      : fitWinner === null
        ? "TIE"
        : fitWinner === 0
          ? "A"
          : "B");
  const fallback =
    test.comparison?.payload?.qloo?.fallback || test.provenance?.qlooFallback;
  return (
    <main
      className={`container experiment-page ${activePrediction || view === "prediction" ? "prediction-view" : ""} ${test.closedAt && view === "verdict" ? "verdict-view" : ""}`}
    >
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
      <div
        className={`page-heading experiment-heading${sample ? " sample-hero-heading" : ""}`}
      >
        <div className="experiment-title">
          {!sample && (
            <div className="test-meta">
              <span className={`status-tag ${test.closedAt ? "" : "live"}`}>
                {test.closedAt ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <Radio size={12} />
                )}
                {test.closedAt
                  ? "Completed"
                  : test.creationMode === "quick"
                    ? "Quick test · excluded from evidence benchmark"
                    : test.isPairedComparison && !test.pollOpenedAt
                      ? "Predictions locked"
                      : test.freezeRequired
                        ? test.lifecycle
                        : "Live test"}
              </span>
              <span>
                {test.seeds.length} taste seeds · Created{" "}
                {new Date(test.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
          {sample ? (
            <>
              <div className="hero-product-kicker">
                AI + QLOO A/B DECISION TOOL
              </div>
              <HeroQuestionRotator />
            </>
          ) : (
            <h1 title={test.title}>{test.title}</h1>
          )}
          {sample && (
            <p className="hero-product-subhead">
              Freeze a prediction. Poll the audience. Get a verdict.
            </p>
          )}
          {sample && <HeroPromptInput />}
          {!sample && (
            <p>
              {activePrediction
                ? "Your hypothesis is ready. Now put it in front of real people."
                : "See what your audience chooses, then make the call."}
            </p>
          )}
        </div>
        {!sample && <Audience test={test} />}
      </div>
      {sample && (
        <div className="sample-example-heading">
          <strong>See a completed example</strong>
          <span>Synthetic cafe signals · illustrative votes</span>
        </div>
      )}
      {test.closedAt && (
        <nav className="report-tabs" aria-label="Report view">
          <button
            aria-label="Prediction"
            className={view === "prediction" ? "selected" : ""}
            onClick={() => setView("prediction")}
          >
            Prediction <small>fit /100</small>
          </button>
          <button
            aria-label="Verdict"
            className={view === "verdict" ? "selected" : ""}
            onClick={() => setView("verdict")}
          >
            Verdict <small>vote share %</small>
          </button>
        </nav>
      )}
      {test.closedAt && view === "verdict" && (
        <Verdict test={test} without={without} setWithout={setWithout} />
      )}
      {(!test.closedAt || view !== "verdict") && (
        <>
          <ErrorMessage>{error}</ErrorMessage>
          {activePrediction && (
            <section
              className="next-panel prediction-next-step"
              aria-label="Prediction and next step"
            >
              <div>
                <div className="eyebrow">YOUR NEXT STEP</div>
                <h2>
                  {displayPick === "A" || displayPick === "B"
                    ? `Agent pick: Option ${displayPick}`
                    : displayPick === "TIE"
                      ? "No clear pick"
                      : "Prediction locked"}
                </h2>
                <p>
                  {displayPick === "A" || displayPick === "B"
                    ? `${test.options[displayPick === "A" ? 0 : 1].title}. `
                    : displayPick === "TIE"
                      ? "The prediction abstains. "
                      : "Predictions stay private until the poll closes. "}
                  Open the poll to learn what your audience actually chooses.
                </p>
                {fallback && (
                  <span className="qloo-fallback-badge">
                    Qloo: no data — heuristic fallback
                  </span>
                )}
                {test.freezeRequired && !test.frozenAt && (
                  <p>
                    Freeze the branch records below before opening the poll.
                  </p>
                )}
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
            </section>
          )}
          {test.isPairedComparison ? (
            <AiComparison test={test} />
          ) : test.prediction ? (
            <Prediction
              test={test}
              without={without}
              setWithout={setWithout}
              showAudience={sample}
            />
          ) : (
            <p className="panel">
              Predictions remain private until the poll closes.
            </p>
          )}
          {sample && (
            <div className="hero-actions">
              <Button
                className="primary"
                onClick={() => {
                  sessionStorage.setItem(
                    REMIX_DRAFT_KEY,
                    JSON.stringify({
                      options: test.options.map((option) => ({
                        title: option.title,
                        description: option.description,
                        imageUrl: option.imageUrl || "",
                      })),
                      seeds: test.seeds,
                      audienceNote: test.audienceNote,
                      insightCategory: test.insightCategory || "Dining",
                    }),
                  );
                  navigate("/create?remix=sample");
                }}
              >
                <Plus size={16} />
                Remix this demo
              </Button>
              {liveSample && (
                <Button onClick={() => navigate(`/poll/${liveSample.id}`)}>
                  Open the live poll
                </Button>
              )}
            </div>
          )}
          {sample && (
            <section className="sample-inline-poll" aria-label="Try the sample">
              <div className="eyebrow">TRY IT / LIVE SAMPLE</div>
              <HeroLivePoll test={liveSample} onUpdate={setLiveSample} />
            </section>
          )}
          <section className="supporting-evidence">
            <div>
              <div className="eyebrow">SUPPORTING EVIDENCE</div>
              <h2>The taste behind the pick</h2>
              <p>
                {test.audienceNote ||
                  "Defined by the selected cultural tastes."}
              </p>
            </div>
            <TasteFlow test={test} />
          </section>
          <FreezePanel test={test} owner={owner} onFrozen={setTest} />
          {!activePrediction && (
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
                        Send the poll to your audience. Results will appear here
                        as they vote.
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
                      {isTrackB && (
                        <PollShareCard
                          url={shareUrl}
                          title={test.title}
                          total={test.totalVotes}
                        />
                      )}
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
            </>
          )}
        </>
      )}
      {copied && (
        <div className="copy-toast" role="status">
          Copied · poll link ready to share
        </div>
      )}
      <footer className="report-footer">
        <span>TasteTest A/B</span>
        <p>
          {[
            test.isPairedComparison
              ? `Two locked AI predictions · same model · ${test.mode === "real" ? "real Qloo context" : "synthetic Qloo context"}`
              : test.mode === "real"
                ? "Real Qloo API affinities · local heuristic fit"
                : "Synthetic Qloo-style signals",
            sample ? "Illustrative sample votes" : "Anonymous audience votes",
            test.mode === "real"
              ? "Not a calibrated vote prediction"
              : "No real Qloo API calls for this example",
          ].join(" · ")}
        </p>
      </footer>
    </main>
  );
}
function PollPage({ id }) {
  const [test, setTest] = useState(null);
  usePageSignal(test);
  const [error, setError] = useState("");
  const [voting, setVoting] = useState(null);
  const [voted, setVoted] = useState(getLocal(`tastetest-vote-${id}`));
  const shortcutState = useRef(null);
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
  shortcutState.current = { test, voted, voting, vote };
  useEffect(() => {
    const voteByKeyboard = (event) => {
      const current = shortcutState.current;
      if (
        !current?.test ||
        current.voted !== null ||
        current.test.closedAt ||
        current.voting !== null ||
        ((current.test.isPairedComparison || current.test.freezeRequired) &&
          !current.test.pollOpenedAt) ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) ||
        document.activeElement?.isContentEditable
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "a" && key !== "b") return;
      event.preventDefault();
      current.vote(key === "a" ? 0 : 1);
    };
    window.addEventListener("keydown", voteByKeyboard);
    return () => window.removeEventListener("keydown", voteByKeyboard);
  }, []);
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
      {test.benchmarkMetadata?.track === "track-b" &&
        !test.closedAt &&
        test.pollOpenedAt && <VoteGoal total={test.totalVotes} />}
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
            className={`panel poll-choice ${voted === String(i) ? "your-vote" : ""} ${voting === i ? "vote-pending" : ""}`}
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
                  `Press ${i ? "B" : "A"} or choose this idea`
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
  const { path: route, navigationId } = useRoute();
  const [pageSignal, setPageSignal] = useState(null);
  const publishSignal = useCallback(
    (record) => setPageSignal({ route, record }),
    [route],
  );
  const match = route.match(/^\/(test|poll)\/([a-f0-9-]{36})$/);
  const musicMatch = route.match(
    /^\/benchmark\/music\/(?:run\/([a-f0-9-]{36})|(MX-\d{3}))$/,
  );
  const proxyMatch = route.match(
    /^\/benchmark\/(?:film|proxy)\/(?:run\/([a-f0-9-]{36})|(PX-\d{3}))$/,
  );
  return (
    <PageSignalContext.Provider value={publishSignal}>
      <Header
        label={pageSignalLabel(
          route,
          config,
          pageSignal?.route === route ? pageSignal.record : null,
        )}
      />
      {[
        "/benchmark-lab/historical-case-01",
        "/case-study/cookie-cats",
      ].includes(route) ? (
        <CaseStudy />
      ) : musicMatch ? (
        <MusicCase key={route} runId={musicMatch[1]} caseId={musicMatch[2]} />
      ) : proxyMatch ? (
        <ProxyCase key={route} runId={proxyMatch[1]} caseId={proxyMatch[2]} />
      ) : route === "/benchmark" ? (
        <Benchmark />
      ) : route === "/faq" ? (
        <FAQ />
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
        <TestView key={`sample-${navigationId}`} sample id="sample" />
      ) : (
        <main className="container not-found-page">
          <div className="eyebrow">404 / OFF THE MAP</div>
          <h1>That page isn’t here.</h1>
          <p>Explore a benchmark case or return to the TasteTest sample.</p>
          <div className="not-found-actions">
            <Button className="primary" onClick={() => navigate("/benchmark")}>
              Back to benchmark
            </Button>
            <Button onClick={() => navigate("/")}>Back to TasteTest</Button>
          </div>
        </main>
      )}
      {route !== "/faq" && <FAQ key={route} compact />}
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
          Benchmark lab · Historical case 01
        </a>
        <a
          href="/faq"
          onClick={(event) => {
            event.preventDefault();
            navigate("/faq");
          }}
        >
          FAQ
        </a>
        <a
          href="https://github.com/hehehehehee-dev/tastetest-ab"
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
        <a
          href="https://github.com/hehehehehee-dev/tastetest-ab#readme"
          target="_blank"
          rel="noreferrer"
        >
          Project docs ↗
        </a>
      </footer>
    </PageSignalContext.Provider>
  );
}
const appRoot = createRoot(document.getElementById("root"));
appRoot.render(<App />);

// Vite can reload this entry module while a long-lived local tab is open.
// Unmount the previous React tree before the replacement is evaluated so an
// old test report cannot remain beside the homepage after hot updates.
if (import.meta.hot) {
  import.meta.hot.dispose(() => appRoot.unmount());
}
