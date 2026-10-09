// Owner-reported case registry. This is not a prediction freeze or an outcome.
export const pendingTrackB = [];
export const excludedTrackBNotes = [
  {
    caseLabel: "TB-001",
    enteredOn: "2026-10-09",
    context:
      "Owner confirms the original record cannot be recovered. Administratively closed as an unverifiable note, not a completed experiment or evidence.",
    status: "closed — unverifiable / excluded from evidence",
    excludedFromEvidence: true,
    seeds: [],
    frozenAt: null,
    originalRecordedAt: null,
    missing:
      "Situation, audience, taste seeds, Option A/B, LLM-only/Qloo/Agent picks, confidences, source/model, original prediction time and outcome status are all unconfirmed. The original record cannot be recovered. Do not count TB-001 in Track B tallies or use it as evidence. Do not rerun any branch, present a rerun as the original prediction, or backdate anything. Fresh Track B cases use separate records, frozen before any poll opens.",
    timing:
      "Entered into ledger on 2026-10-09; original prediction and outcome timing remain unconfirmed. Registry note closed as unverifiable; no poll closure, freeze or outcome timestamp is claimed. Not scored. No rerun or backdating.",
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
  const all = [
    ...data.rows,
    ...data.openCases,
    ...data.pending,
    ...(data.excludedNotes || []),
  ];
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
        r.excludedFromEvidence
          ? "excluded from evidence"
          : r.result
            ? r.result.eligible
            : "not scored",
        r.missing || r.result?.reasons.join("; ") || r.timing,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") + "\r\n"
  );
}
