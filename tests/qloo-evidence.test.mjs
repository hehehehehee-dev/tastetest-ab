import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordedQlooEvidence,
  seedExplanations,
} from "../src/qlooEvidence.mjs";
const evidence = {
  seeds: [
    { entity_id: "seed-a", name: "Recorded seed A" },
    { entity_id: "seed-b", name: "Recorded seed B" },
  ],
  recommendations: [
    {
      entity_id: "option-a",
      name: "Recorded option",
      explainability: {
        "signal.interests.entities": [
          { entity_id: "SEED-A", score: 0.3 },
          { entity_id: "seed-b", score: 0.7 },
          { entity_id: "unknown", score: 1 },
          { entity_id: "seed-a", score: 0.4 },
          { entity_id: "seed-b", score: "0.8" },
        ],
      },
    },
  ],
};
test("evidence reads legacy frozen prompt without modifying it; structured receipts take precedence", () => {
  const original = {
    mode: "real",
    comparison: {
      payload: {
        aiQloo: {
          prompt: { input: JSON.stringify({ qlooSignals: evidence }) },
        },
      },
    },
  };
  const snapshot = JSON.stringify(original);
  assert.deepEqual(recordedQlooEvidence(original), evidence);
  assert.equal(JSON.stringify(original), snapshot);
  const fresh = {
    ...original,
    comparison: {
      payload: {
        ...original.comparison.payload,
        qlooEvidence: { source: "Qloo API", ...evidence },
      },
    },
  };
  assert.equal(
    recordedQlooEvidence(fresh),
    fresh.comparison.payload.qlooEvidence,
  );
  assert.equal(recordedQlooEvidence({ ...original, mode: "mock" }), null);
  assert.equal(
    recordedQlooEvidence({
      mode: "real",
      comparison: {
        payload: { aiQloo: { prompt: { input: "invalid JSON" } } },
      },
    }),
    null,
  );
});
test("explainability uses only recorded seeds, rejects invalid contributions and preserves candidate labels", () => {
  const rows = seedExplanations(evidence, [
    { entityId: "OPTION-A", label: "A" },
  ]);
  assert.equal(rows[0].label, "A");
  assert.deepEqual(
    rows[0].contributors.map((v) => [v.name, v.score]),
    [
      ["Recorded seed B", 0.7],
      ["Recorded seed A", 0.3],
    ],
  );
  assert.deepEqual(
    seedExplanations({ seeds: [], recommendations: evidence.recommendations }),
    [],
  );
  assert.deepEqual(seedExplanations(null), []);
});
