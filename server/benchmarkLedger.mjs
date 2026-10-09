// Owner-reported case registry. This is not a prediction freeze or an outcome.
export const pendingTrackB = [
  {
    caseLabel: "TB-001",
    enteredOn: "2026-10-09",
    context:
      "Owner confirms the original AI + Qloo record cannot be recovered. This incomplete registry entry is not evidence.",
    status: "partial record — pending",
    seeds: [],
    frozenAt: null,
    originalRecordedAt: null,
    missing:
      "Situation, audience, 3–5 seeds, A/B descriptions, original branch answers/confidences/sources, original timing and customer outcome status remain unconfirmed. The original record cannot be recovered. Do not use TB-001 as evidence, rerun it, or backdate it. A new Track B case needs a separate record and predictions frozen before polling.",
    timing:
      "Entered into ledger on 2026-10-09; exact original prediction time remains unconfirmed. Not frozen, not collecting, not scored. No rerun or backdating.",
  },
];
export function ledgerCsv(data) {
  const columns = [
    "case",
    "status",
    "context",
    "seeds",
    "entered_on",
    "frozen_at",
    "original_recorded_at",
    "closed_at",
    "mode",
    "llm_pick",
    "qloo_pick",
    "agent_pick",
    "votes_a",
    "votes_b",
    "eligible",
    "notes",
  ];
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const all = [...data.rows, ...data.openCases, ...data.pending];
  return (
    [
      columns,
      ...all.map((r) => [
        r.caseLabel,
        r.status || "closed",
        r.context,
        (r.seeds || []).map((s) => s.name || s).join(" | "),
        r.enteredOn,
        r.frozenAt,
        r.originalRecordedAt,
        r.closedAt,
        r.mode,
        r.branches?.llm.pick,
        r.branches?.qloo.pick,
        r.branches?.agent.pick,
        r.result?.votes[0],
        r.result?.votes[1],
        r.result ? r.result.eligible : "not scored",
        r.missing || r.result?.reasons.join("; ") || r.timing,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") + "\r\n"
  );
}
