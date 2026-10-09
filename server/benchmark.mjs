import { createHash } from "node:crypto";
import { predictionConfidence } from "../shared/confidence.mjs";
const fail = (message) => {
  throw Object.assign(Error(message), { status: 400 });
};
const choice = (value) => value === "A" || value === "B" || value === "TIE";
export const freezeHash = (payload) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");
export function validateMetadata(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail("Provide valid case metadata.");
  const track = body.track || "rehearsal";
  if (!["track-b", "rehearsal"].includes(track))
    fail("Choose Track B or workflow rehearsal.");
  const clean = (key, limit = 300) => {
    const value = body[key] || "";
    if (typeof value !== "string" || value.length > limit)
      fail(`Invalid ${key}.`);
    return value.trim();
  };
  return {
    track,
    caseLabel: clean("caseLabel", 60),
    business: clean("business"),
    decision: clean("decision"),
    channel: clean("channel"),
    unpublished: body.unpublished === true,
    audienceVerified: body.audienceVerified === true,
    calibrationNote: clean("calibrationNote"),
  };
}
export function validateManual(value, name, allowTie = false) {
  if (!value || !choice(value.pick) || (!allowTie && value.pick === "TIE"))
    fail(`${name} needs an A/B pick.`);
  if (
    !Number.isInteger(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 100
  )
    fail(`${name} confidence must be 0–100.`);
  if (
    typeof value.source !== "string" ||
    !value.source.trim() ||
    value.source.length > 160
  )
    fail(`${name} needs an exact model/version or human source.`);
  if (
    typeof value.answer !== "string" ||
    value.answer.trim().length < 10 ||
    value.answer.length > 6000
  )
    fail(`${name} needs its written answer (10–6,000 characters).`);
  return {
    pick: value.pick,
    confidence: value.confidence,
    source: value.source.trim(),
    answer: value.answer.trim(),
    method: "manual paste",
    confidenceKind: "self-reported, not calibrated",
  };
}
export function heuristicBranch(scores) {
  const c = predictionConfidence(scores);
  return {
    pick: c.tooClose ? "TIE" : scores[0].score > scores[1].score ? "A" : "B",
    confidence: c.tooClose ? 40 : c.level === "Moderate" ? 65 : 80,
    confidenceKind: "heuristic separation, not calibrated",
    gap: c.gap,
    affinityGap: c.affinityGap,
    source: "TasteTest concept-tag-fit-v2",
    method: "Qloo-informed local heuristic",
  };
}
export function makeFreeze(test, body, now = new Date().toISOString()) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail("Provide a valid freeze record.");
  const llm = validateManual(body.llm, "LLM-only (manual paste)");
  const metadata = validateMetadata(body.metadata || test.benchmarkMetadata);
  const manual = body.mode === "manual";
  if (body.mode && !["manual", "mock", "real-qloo"].includes(body.mode))
    fail("Unsupported freeze mode.");
  if (
    test.proxyCaseId ? body.beforeReveal !== true : body.beforeOutcome !== true
  )
    fail(
      test.proxyCaseId
        ? "Confirm that this segment's outcome has not been viewed yet."
        : "Confirm that no outcome or vote has been collected yet.",
    );
  if (
    manual &&
    (!body.originalRecordedAt ||
      !Number.isFinite(Date.parse(body.originalRecordedAt)) ||
      Date.parse(body.originalRecordedAt) > Date.parse(now))
  )
    fail(
      "Manual records need a valid original prediction timestamp before recording now.",
    );
  const automatic = heuristicBranch(test.prediction);
  if (test.scoringVersion === "qloo-candidate-affinity-v1") {
    automatic.source = "Qloo candidate affinity · v1";
    automatic.method =
      "Direct /v2/insights candidate affinity; gap rule <10 abstains";
  }
  const qloo = manual
    ? validateManual(body.qloo, "Qloo", true)
    : { ...automatic };
  const agent = manual
    ? validateManual(body.agent, "Agent", true)
    : { ...automatic };
  const payload = {
    schemaVersion: 1,
    testId: test.id,
    caseLabel: metadata.caseLabel || `TB-${test.id.slice(0, 8).toUpperCase()}`,
    frozenAt: now,
    mode: manual ? "manual" : test.mode === "real" ? "real-qloo" : "mock",
    metadata,
    options: test.options.map(({ title, description }) => ({
      title,
      description,
    })),
    audience: {
      note: test.audienceNote,
      seeds: test.seeds.map(({ entity_id, name, category }) => ({
        entity_id,
        name,
        category,
      })),
    },
    branches: { llm, qloo, agent },
    ...(test.proxyCaseId
      ? {
          scoringVersion: test.scoringVersion || "concept-tag-fit-v2",
          provenance: test.provenance || null,
        }
      : {}),
    beforeOutcomeConfirmed: !test.proxyCaseId,
    ...(test.proxyCaseId
      ? {
          proxyCaseId: test.proxyCaseId,
          beforeRevealConfirmed: true,
          timing:
            "Retrospective proxy: ratings pre-exist this freeze. Only reveal occurs after predictions are sealed.",
        }
      : {}),
    originalRecordedAt: manual
      ? new Date(body.originalRecordedAt).toISOString()
      : null,
    note: manual
      ? "External predictions recorded before any outcome, as declared by owner; source/timing are not independently audited."
      : test.scoringVersion === "qloo-candidate-affinity-v1"
        ? "Qloo and Agent share the same direct candidate affinity and abstention rule; not independent predictors."
        : "Qloo and agent currently use the same local scoreOption heuristic and are not independent predictors.",
    minVotes: 20,
    minCases: 20,
  };
  return { payload, sha256: freezeHash(payload) };
}
export function scoreFreeze(freeze, counts) {
  const total = counts[0] + counts[1];
  const actual =
    total && counts[0] !== counts[1]
      ? counts[0] > counts[1]
        ? "A"
        : "B"
      : null;
  const p = freeze.payload,
    reasons = [];
  if (total < 20) reasons.push("indicative only — fewer than 20 votes");
  if (!actual) reasons.push(total ? "tied outcome" : "no votes");
  if (p.metadata.track !== "track-b" || !p.metadata.unpublished)
    reasons.push("workflow rehearsal / public case");
  if (p.mode === "mock") reasons.push("mock signals, workflow only");
  if (!p.metadata.audienceVerified)
    reasons.push("audience taste membership unverified");
  const grade = (branch) =>
    !actual
      ? "—"
      : branch.pick === "TIE"
        ? "ABSTAIN"
        : branch.pick === actual
          ? "✓"
          : "✗";
  const grades = Object.fromEntries(
    Object.entries(p.branches).map(([key, value]) => [key, grade(value)]),
  );
  return {
    total,
    votes: counts,
    actual,
    grades,
    eligible: reasons.length === 0,
    reasons,
    confidence: Object.fromEntries(
      Object.entries(p.branches).map(([key, value]) => [key, value.confidence]),
    ),
    calibration: Object.fromEntries(
      Object.entries(p.branches).map(([key, value]) => [
        key,
        actual && value.pick !== "TIE"
          ? { confidence: value.confidence, correct: value.pick === actual }
          : null,
      ]),
    ),
  };
}
export function benchmarkTally(rows) {
  const closed = rows.filter((row) => row.closedAt),
    eligible = closed.filter((row) => row.result?.eligible);
  const ready = eligible.length >= 20;
  return {
    closedCases: closed.length,
    evaluableCases: eligible.length,
    minimumCases: 20,
    ready,
    message: ready
      ? "Counts over evaluable unpublished cases"
      : "not enough cases yet",
    counts: Object.fromEntries(
      ["llm", "qloo", "agent"].map((key) => [
        key,
        {
          correct: eligible.filter((r) => r.result.grades[key] === "✓").length,
          total: eligible.length,
        },
      ]),
    ),
    decisionCounts: decisionTally(eligible),
  };
}
export function decisionTally(rows) {
  return Object.fromEntries(
    ["llm", "qloo", "agent"].map((key) => [
      key,
      {
        correct: rows.filter((r) => r.result.grades[key] === "✓").length,
        total: rows.filter((r) => ["✓", "✗"].includes(r.result.grades[key]))
          .length,
        abstained: rows.filter((r) => r.result.grades[key] === "ABSTAIN")
          .length,
        cases: rows.length,
      },
    ]),
  );
}
