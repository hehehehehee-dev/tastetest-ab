import { createHash } from "node:crypto";

export const verdictChatStarters = [
  "Why this pick?",
  "Where did the branches disagree?",
  "What would change this verdict?",
  "How confident should I be?",
];

export const verdictChatCapReply =
  "That’s enough questions for this verdict in this session.";
export const verdictChatScopeReply =
  "I only know what’s in this verdict. Ask about its taste seeds, recorded signals, branch picks, outcome, or freeze receipt.";

const hash = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
const clean = (value, limit = 160) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const finite = (value) => (Number.isFinite(value) ? value : null);
const pick = (value) =>
  ["A", "B", "TIE"].includes(value) ? value : value == null ? null : null;

function branchFacts(branches = {}) {
  return Object.fromEntries(
    ["llm", "qloo", "agent"].map((key) => {
      const branch = branches[key] || {};
      return [
        key,
        {
          pick: pick(branch.pick),
          confidence: finite(branch.confidence),
          gap: finite(branch.gap),
          source: clean(branch.source),
        },
      ];
    }),
  );
}

function signalFacts(signals = []) {
  return (Array.isArray(signals) ? signals : [])
    .filter((signal) => clean(signal.name) && finite(signal.affinity) !== null)
    .map((signal) => ({
      name: clean(signal.name),
      affinity: signal.affinity,
    }))
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, 6);
}

export function trackBChatContext(test, snapshot) {
  const freeze = snapshot.freeze;
  if (
    !snapshot.closedAt ||
    !freeze ||
    freeze.payload.metadata?.track !== "track-b"
  )
    throw Object.assign(
      Error("Chat is available after a frozen case closes."),
      {
        status: 409,
      },
    );
  return {
    kind: "track-b",
    caseId: test.id,
    label: clean(freeze.payload.caseLabel) || clean(test.title),
    options: freeze.payload.options.map((option, index) => ({
      label: index ? "B" : "A",
      name: clean(option.title),
    })),
    seeds: freeze.payload.audience.seeds.map((seed) => clean(seed.name)),
    signals: signalFacts(test.insights),
    branches: branchFacts(freeze.payload.branches),
    outcome: {
      actual: snapshot.benchmarkResult?.actual ?? null,
      votes: snapshot.votes.map((value) => Number(value) || 0),
      totalVotes: snapshot.totalVotes,
    },
    freeze: {
      timestamp: freeze.payload.frozenAt,
      hash: freeze.sha256,
    },
  };
}

export function proxyChatContext(run, freeze, result, outcome) {
  if (!freeze || !result || !outcome)
    throw Object.assign(Error("Chat is available after the proxy reveal."), {
      status: 409,
    });
  const music = run.proxyDomain === "music";
  return {
    kind: music ? "proxy-music" : "proxy-film",
    caseId: run.proxyCaseId,
    label: run.proxyCaseId,
    options: run.options.map((option, index) => ({
      label: index ? "B" : "A",
      name: clean(option.title || option.name),
    })),
    seeds: run.input.seeds.map((seed) => clean(seed.title || seed.name)),
    signals: signalFacts(freeze.payload.provenance?.affinities),
    branches: branchFacts(freeze.payload.branches),
    outcome: {
      actual: outcome.actual,
      segmentUsers: outcome.segmentUsers,
      metric: music ? "mean observed listens" : "mean rating",
      options: outcome.options.map((option, index) => ({
        label: index ? "B" : "A",
        mean: finite(option.mean),
        observations: Number(option.count) || 0,
      })),
    },
    freeze: {
      timestamp: freeze.payload.frozenAt,
      hash: freeze.sha256,
    },
  };
}

const outsidePattern =
  /\b(election|president|prime minister|weather|forecast|stock|crypto|bitcoin|medical|diagnos|lawyer|legal advice|sports? score|war|celebrity gossip)\b/i;
const casePattern =
  /\b(verdict|result|pick|option|branch|qloo|llm|agent|signal|affinity|seed|taste|vote|voter|segment|rating|listen|confidence|confident|gap|freeze|hash|sha|outcome|winner|disagree|change|why|how)\b/i;

export function questionScope(question) {
  const value = clean(question, 500);
  if (!value) return "invalid";
  if (outsidePattern.test(value)) return "out-of-scope";
  return casePattern.test(value) ? "in-scope" : "model-check";
}

function localIntent(question) {
  const value = question.toLowerCase();
  if (/disagree|branch/.test(value)) return "branches";
  if (/change|different|reverse|flip/.test(value)) return "change";
  if (/confiden|certain|trust|reliable|accuracy/.test(value))
    return "confidence";
  if (/why|pick|choose|chose/.test(value)) return "why";
  return "general";
}

function optionName(context, label) {
  return (
    context.options.find((option) => option.label === label)?.name ||
    `Option ${label}`
  );
}

function branchSentence(context) {
  const labels = { llm: "AI-only", qloo: "Qloo", agent: "Agent" };
  return Object.entries(context.branches)
    .map(([key, branch]) => {
      const declared = branch.pick || "Not run";
      const confidence =
        branch.confidence === null ? "" : ` at ${branch.confidence}/100`;
      return `${labels[key]}: ${declared}${confidence}`;
    })
    .join(" · ");
}

function outcomeSentence(context) {
  const actual = context.outcome.actual;
  if (!actual) return "The recorded outcome has no non-tied winner.";
  if (context.kind === "track-b")
    return `The observed winner was Option ${actual} (${optionName(context, actual)}) from ${context.outcome.votes[0]}–${context.outcome.votes[1]} votes.`;
  const rows = context.outcome.options
    .map((row) => `${row.label} ${row.mean}`)
    .join(" versus ");
  return `The historical segment winner was Option ${actual} (${optionName(context, actual)}): ${rows} ${context.outcome.metric}, across ${context.outcome.segmentUsers} segment users.`;
}

function signalSentence(context) {
  if (!context.signals.length)
    return "No named affinity signals were recorded in this frozen verdict.";
  return `The strongest recorded affinity signals were ${context.signals
    .slice(0, 3)
    .map((signal) => signal.name)
    .join(", ")}.`;
}

export function composeVerdictChatAnswer(
  question,
  context,
  modelDecision = {},
) {
  if (questionScope(question) === "out-of-scope") return verdictChatScopeReply;
  if (modelDecision.scope === "out-of-scope") return verdictChatScopeReply;
  const intent = [
    "why",
    "branches",
    "change",
    "confidence",
    "general",
  ].includes(modelDecision.intent)
    ? modelDecision.intent
    : localIntent(question);
  if (intent === "why") {
    const qloo = context.branches.qloo;
    const qlooLine = qloo.pick
      ? `The frozen Qloo branch picked Option ${qloo.pick} (${optionName(context, qloo.pick)})${qloo.gap === null ? "" : ` with a ${Math.round(qloo.gap)}-point fit gap`}.`
      : "The frozen Qloo branch did not declare A or B.";
    return `${qlooLine} ${signalSentence(context)} ${outcomeSentence(context)} These signals explain the recorded choice; they do not prove future accuracy.`;
  }
  if (intent === "branches")
    return `${branchSentence(context)}. ${outcomeSentence(context)} Confidence and fit gaps are fit-gap heuristics, not calibrated probabilities.`;
  if (intent === "change")
    return `This frozen verdict cannot be changed: it is sealed at ${context.freeze.timestamp} with SHA-256 ${context.freeze.hash.slice(0, 12)}. A new case could differ if its taste seeds, recorded affinity signals, branch predictions, or observed outcome differed. This verdict is not proof of future accuracy.`;
  if (intent === "confidence")
    return `${branchSentence(context)}. Confidence is a fit-gap heuristic, not a calibrated probability. ${outcomeSentence(context)} One frozen case does not prove future accuracy.`;
  return `${signalSentence(context)} ${branchSentence(context)}. ${outcomeSentence(context)} Frozen ${context.freeze.timestamp} · SHA-256 ${context.freeze.hash.slice(0, 12)}. This verdict does not prove future accuracy.`;
}

export function verdictChatModelInput(question, context) {
  const facts = {
    case: context.label,
    options: context.options,
    seeds: context.seeds,
    signals: context.signals,
    branches: context.branches,
    outcome: context.outcome,
    freeze: context.freeze,
  };
  return { question, facts };
}

export function createVerdictChat({ store, responder }) {
  return async ({ verdictKey, sessionId, question, context }) => {
    if (typeof sessionId !== "string" || !/^[a-f0-9-]{36}$/i.test(sessionId))
      throw Object.assign(Error("Start a valid verdict chat session."), {
        status: 400,
      });
    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > 500
    )
      throw Object.assign(Error("Ask a question in 500 characters or fewer."), {
        status: 400,
      });
    const cleanQuestion = question.trim();
    const countRoot = `verdict-chat-count/${hash(verdictKey)}/${hash(sessionId)}`;
    const occupied = new Set(
      (await store.list(`${countRoot}/`))
        .map((key) => Number(key.slice(key.lastIndexOf("/") + 1)))
        .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 10),
    );
    if (occupied.size >= 10)
      return { answer: verdictChatCapReply, count: 10, capped: true };
    let count = 10;
    let reserved = false;
    for (let slot = 1; slot <= 10; slot++) {
      if (occupied.has(slot)) continue;
      if (
        await store.set(
          `${countRoot}/${slot}`,
          {
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { onlyIfNew: true },
        )
      ) {
        count = slot;
        reserved = true;
        break;
      }
    }
    if (!reserved)
      return { answer: verdictChatCapReply, count: 10, capped: true };
    const scope = questionScope(cleanQuestion);
    if (scope === "out-of-scope")
      return {
        answer: verdictChatScopeReply,
        count,
        capped: false,
      };
    let decision = {};
    try {
      decision = await responder(verdictChatModelInput(cleanQuestion, context));
    } catch (error) {
      if (scope === "model-check") throw error;
      // Starter and clearly case-scoped questions still have a fully grounded,
      // deterministic answer when the configured model is temporarily unavailable.
    }
    return {
      answer: composeVerdictChatAnswer(cleanQuestion, context, decision),
      count,
      capped: false,
    };
  };
}
