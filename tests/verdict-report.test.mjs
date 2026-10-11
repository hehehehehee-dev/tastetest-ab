import assert from "node:assert/strict";
import test from "node:test";
import {
  disagreementLine,
  normalizedOutcomeMargin,
  surpriseNotes,
  verdictBranchRows,
} from "../src/verdictReport.mjs";

const rows = (branches, actual = "B") =>
  verdictBranchRows(branches, {}, actual);

test("matched branch comparison has no invented surprise", () => {
  const value = rows({
    llm: { pick: "A", confidence: 60 },
    qloo: { pick: "B", confidence: 70, gap: 16 },
    agent: { pick: "B", confidence: 70, gap: 16 },
  });
  assert.match(disagreementLine(value), /Qloo and Agent agreed on Option B/);
  assert.deepEqual(
    surpriseNotes({
      rows: value,
      actual: "B",
      actualMargin: 18,
      fitGap: 16,
    }),
    ["No surprises — the outcome tracked the signals."],
  );
});

test("highest-confidence miss and unanimous miss are rule-generated", () => {
  const highMiss = rows({
    llm: { pick: "A", confidence: 90 },
    qloo: { pick: "B", confidence: 60 },
    agent: { pick: "B", confidence: 60 },
  });
  assert.match(
    surpriseNotes({ rows: highMiss, actual: "B" })[0],
    /Highest-confidence branch LLM-only missed at 90\/100/,
  );

  const unanimous = rows({
    llm: { pick: "A", confidence: 80 },
    qloo: { pick: "A", confidence: 80 },
    agent: { pick: "A", confidence: 80 },
  });
  assert.equal(
    disagreementLine(unanimous),
    "All three branches agreed — this validates the pick, not Qloo's unique contribution.",
  );
  assert.ok(
    surpriseNotes({ rows: unanimous, actual: "B" }).some((note) =>
      note.includes("unanimous Option A prediction missed"),
    ),
  );
});

test("abstention and margin mismatch stay explicit", () => {
  const value = rows(
    {
      llm: { pick: "A", confidence: 55 },
      qloo: { pick: "TIE", confidence: 40 },
      agent: { pick: "A", confidence: 60 },
    },
    "A",
  );
  const notes = surpriseNotes({
    rows: value,
    actual: "A",
    actualMargin: 55,
    fitGap: 10,
    marginName: "Vote margin",
  });
  assert.ok(notes.some((note) => note.includes("far wider")));
  assert.ok(notes.some((note) => note.includes("Qloo abstained")));
});

test("outcome margin normalization uses only supplied values", () => {
  assert.equal(normalizedOutcomeMargin([15, 5], 20), 50);
  assert.equal(normalizedOutcomeMargin([4.5, 3.5], 5), 20);
  assert.equal(normalizedOutcomeMargin([0, 0]), 0);
  assert.equal(normalizedOutcomeMargin(null, 5), null);
});
