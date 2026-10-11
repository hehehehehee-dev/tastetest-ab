export const branchLabels = {
  llm: "LLM-only",
  qloo: "Qloo",
  agent: "Agent",
};

const declaredPick = (pick) => pick === "A" || pick === "B";
const joinNames = (names) =>
  names.length < 2
    ? names[0] || ""
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function verdictBranchRows(branches = {}, grades = {}, actual = null) {
  return ["llm", "qloo", "agent"].map((key) => {
    const branch = branches[key] || {};
    const pick = branch.pick ?? null;
    const grade = grades[key];
    const status =
      grade === "✓" || grade === "MATCH"
        ? "matched"
        : grade === "✗" || grade === "MISS"
          ? "missed"
          : pick === "TIE"
            ? "abstained"
            : actual && declaredPick(pick)
              ? pick === actual
                ? "matched"
                : "missed"
              : "pending";
    return {
      key,
      label: branchLabels[key],
      pick,
      confidence: Number.isFinite(branch.confidence) ? branch.confidence : null,
      gap: Number.isFinite(branch.gap)
        ? branch.gap
        : Number.isFinite(branch.affinityGap)
          ? branch.affinityGap
          : null,
      status,
      source: branch.source || "Not recorded",
    };
  });
}

export function disagreementLine(rows) {
  const declared = rows.filter((row) => declaredPick(row.pick));
  const abstained = rows.filter((row) => row.pick === "TIE");
  const missing = rows.filter(
    (row) => !declaredPick(row.pick) && row.pick !== "TIE",
  );
  if (
    declared.length === rows.length &&
    new Set(declared.map((row) => row.pick)).size === 1
  )
    return "All three branches agreed — this validates the pick, not Qloo's unique contribution.";

  const groups = ["A", "B"]
    .map((pick) => ({
      pick,
      rows: declared.filter((row) => row.pick === pick),
    }))
    .filter((group) => group.rows.length);
  const parts = groups.map((group) => {
    const names = joinNames(group.rows.map((row) => row.label));
    return `${names} ${group.rows.length > 1 ? "agreed" : "picked"} on Option ${group.pick}`;
  });
  if (abstained.length)
    parts.push(`${joinNames(abstained.map((row) => row.label))} abstained`);
  if (missing.length)
    parts.push(
      `${joinNames(missing.map((row) => row.label))} ${missing.length > 1 ? "were" : "was"} not recorded`,
    );
  return `${parts.join("; ")}.`;
}

export function surpriseNotes({
  rows,
  actual,
  actualMargin,
  fitGap,
  marginName = "Vote margin",
}) {
  const notes = [];
  const declared = rows.filter((row) => declaredPick(row.pick));
  const confidences = declared
    .map((row) => row.confidence)
    .filter(Number.isFinite);
  if (confidences.length) {
    const highest = Math.max(...confidences);
    const missed = declared.filter(
      (row) => row.confidence === highest && row.status === "missed",
    );
    if (missed.length)
      notes.push(
        `Highest-confidence ${missed.length > 1 ? "branches" : "branch"} ${joinNames(missed.map((row) => row.label))} missed at ${highest}/100.`,
      );
  }
  if (
    actual &&
    declared.length === rows.length &&
    new Set(declared.map((row) => row.pick)).size === 1 &&
    declared[0].pick !== actual
  )
    notes.push(
      `The unanimous Option ${declared[0].pick} prediction missed the Option ${actual} outcome.`,
    );
  if (
    Number.isFinite(actualMargin) &&
    Number.isFinite(fitGap) &&
    Math.abs(actualMargin - fitGap) >= 20
  )
    notes.push(
      `${marginName} was ${actualMargin < fitGap ? "far narrower" : "far wider"} than the ${Math.round(fitGap)}-point fit gap suggested.`,
    );
  const abstained = rows.filter((row) => row.pick === "TIE");
  if (abstained.length && declared.length)
    notes.push(
      `${joinNames(abstained.map((row) => row.label))} abstained while ${joinNames(declared.map((row) => row.label))} declared a pick.`,
    );
  return notes.length
    ? notes
    : ["No surprises — the outcome tracked the signals."];
}

export function normalizedOutcomeMargin(values, scale) {
  if (!Array.isArray(values) || values.length !== 2) return null;
  if (!values.every(Number.isFinite)) return null;
  const denominator = Number.isFinite(scale)
    ? scale
    : Math.max(...values.map(Math.abs), 0);
  if (!denominator) return 0;
  return (Math.abs(values[0] - values[1]) / denominator) * 100;
}
