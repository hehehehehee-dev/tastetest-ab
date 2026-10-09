import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingTrackB, ledgerCsv } from "../server/benchmarkLedger.mjs";
import { benchmarkTally } from "../server/benchmark.mjs";
import { createApi } from "../server/api.mjs";
test("pending TB-001 has no invented answers or timing and is excluded from counts and exported honestly", async () => {
  const api = createApi({ list: async () => [], get: async () => null });
  const response = await api(new Request("https://fixture/api/benchmark"));
  const data = await response.json();
  assert.equal(data.pending[0].caseLabel, "TB-001");
  assert.equal(data.pending[0].frozenAt, null);
  assert.equal(data.pending[0].branches, undefined);
  assert.equal(data.tally.closedCases, 0);
  const csv = await (
    await api(new Request("https://fixture/api/benchmark/export.csv"))
  ).text();
  assert.match(csv, /TB-001/);
  assert.match(csv, /partial record — pending/);
  assert.match(csv, /not scored/);
});
test("CSV quotes commas/newlines and neutralizes formulas; Track B decision coverage separates abstention", () => {
  const csv = ledgerCsv({
    rows: [
      { caseLabel: "=EVIL()", context: 'comma, "quote"\nline', seeds: [] },
    ],
    openCases: [],
    pending: pendingTrackB,
  });
  assert.match(csv, /"'=EVIL\(\)"/);
  assert.match(csv, /comma, ""quote""\nline/);
  const tally = benchmarkTally([
    {
      closedAt: "now",
      result: {
        eligible: true,
        grades: { llm: "✗", qloo: "ABSTAIN", agent: "✓" },
      },
    },
  ]);
  assert.deepEqual(tally.decisionCounts.qloo, {
    correct: 0,
    total: 0,
    abstained: 1,
    cases: 1,
  });
  assert.deepEqual(tally.decisionCounts.agent, {
    correct: 1,
    total: 1,
    abstained: 0,
    cases: 1,
  });
  assert.equal(tally.ready, false);
});
