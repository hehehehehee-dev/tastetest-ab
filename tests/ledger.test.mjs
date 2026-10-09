import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pendingTrackB,
  excludedTrackBNotes,
  ledgerCsv,
} from "../server/benchmarkLedger.mjs";
import { benchmarkTally } from "../server/benchmark.mjs";
import { createApi } from "../server/api.mjs";
test("open ledger follows frozen track metadata rather than the creation route", async () => {
  const records = new Map([
    [
      "tests/promoted",
      {
        id: "promoted",
        title: "A vs B",
        seeds: [],
        benchmarkMetadata: { track: "rehearsal" },
      },
    ],
    [
      "freezes/promoted",
      {
        payload: {
          caseLabel: "TB-112",
          frozenAt: "2026-10-09T21:33:49.306Z",
          metadata: {
            track: "track-b",
            business: "Association",
            decision: "Event theme",
          },
        },
      },
    ],
    [
      "tests/demoted",
      {
        id: "demoted",
        title: "Rehearsal",
        seeds: [],
        benchmarkMetadata: { track: "track-b" },
      },
    ],
    ["freezes/demoted", { payload: { metadata: { track: "rehearsal" } } }],
  ]);
  const api = createApi({
    get: async (key) => records.get(key),
    list: async (prefix) =>
      [...records.keys()].filter((key) => key.startsWith(prefix)),
  });
  const data = await (
    await api(new Request("https://fixture/api/benchmark"))
  ).json();
  assert.equal(data.openCases.length, 1);
  assert.equal(data.openCases[0].caseLabel, "TB-112");
  assert.equal(
    data.openCases[0].status,
    "predictions frozen / awaiting outcome",
  );
  assert.equal(data.tally.closedCases, 0);
});
test("closed unverifiable TB-001 has no invented answers or timing and is excluded from counts and exported honestly", async () => {
  const api = createApi({ list: async () => [], get: async () => null });
  const response = await api(new Request("https://fixture/api/benchmark"));
  const data = await response.json();
  assert.equal(data.excludedNotes[0].caseLabel, "TB-001");
  assert.equal(data.excludedNotes[0].frozenAt, null);
  assert.equal(data.excludedNotes[0].branches, undefined);
  assert.equal(
    data.excludedNotes[0].status,
    "closed — unverifiable / excluded from evidence",
  );
  assert.equal(data.excludedNotes[0].excludedFromEvidence, true);
  assert.deepEqual(data.pending, []);
  assert.deepEqual(data.rows, []);
  assert.deepEqual(data.openCases, []);
  assert.equal(data.tally.closedCases, 0);
  assert.equal(data.tally.evaluableCases, 0);
  for (const counts of Object.values(data.tally.counts))
    assert.equal(counts.total, 0);
  const csv = await (
    await api(new Request("https://fixture/api/benchmark/export.csv"))
  ).text();
  assert.match(csv, /TB-001/);
  assert.match(csv, /closed — unverifiable \/ excluded from evidence/);
  assert.match(csv, /excluded from evidence/);
  assert.match(csv, /Do not rerun any branch/);
});
test("CSV quotes commas/newlines and neutralizes formulas; Track B decision coverage separates abstention", () => {
  const csv = ledgerCsv({
    rows: [
      { caseLabel: "=EVIL()", context: 'comma, "quote"\nline', seeds: [] },
    ],
    openCases: [],
    pending: pendingTrackB,
    excludedNotes: excludedTrackBNotes,
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
