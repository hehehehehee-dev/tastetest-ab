import { randomUUID } from "node:crypto";

// Aggregated from the user-supplied CSV; no player identifiers redistributed.
export const cookieCats = {
  source:
    "https://www.kaggle.com/datasets/mursideyarkin/mobile-games-ab-testing-cookie-cats",
  rows: 90189,
  groups: [
    { option: "A", gate: 30, players: 44700, day1: 20034, day7: 8502 },
    { option: "B", gate: 40, players: 45489, day1: 20119, day7: 8279 },
  ],
  actual: "A",
  day7DifferencePp: -0.8201298315205913,
  day7Ci95Pp: [-1.328164577146224, -0.3120950858949586],
  day7P: 0.001554381609514377,
  method:
    "Two-sided pooled two-proportion z test; unpooled Wald 95% interval, B minus A.",
};
export function makeCookieCommit(body) {
  if (
    !body ||
    !["A", "B"].includes(body.choice) ||
    typeof body.model !== "string" ||
    !body.model.trim() ||
    body.model.length > 100 ||
    !["LLM only", "Qloo", "TasteTest agent", "Human"].includes(body.source) ||
    !Number.isInteger(body.confidence) ||
    body.confidence < 0 ||
    body.confidence > 100 ||
    typeof body.rationale !== "string" ||
    !body.rationale.trim() ||
    body.rationale.length > 2000
  ) {
    throw Object.assign(
      new Error(
        "Provide a source, exact model/version, A/B choice, confidence (0–100%) and rationale.",
      ),
      { status: 400 },
    );
  }
  return {
    id: randomUUID(),
    committedAt: new Date().toISOString(),
    choice: body.choice,
    model: body.model.trim(),
    source: body.source,
    confidence: body.confidence,
    rationale: body.rationale.trim(),
    purpose: "Historical workflow rehearsal only; not a model benchmark.",
  };
}
