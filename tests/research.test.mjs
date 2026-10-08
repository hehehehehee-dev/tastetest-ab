import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeStudy, validateDraft } from "../research/study.mjs";
import { cookieCats, makeCookieCommit } from "../server/cookieCats.mjs";
import { predictionConfidence } from "../shared/confidence.mjs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

function study() {
  const cases = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    predictions: { ai: { choice: i < 10 ? "A" : "B" }, qloo: { choice: "A" } },
  }));
  const lock = {
    cases,
    protocol: { minimumVotes: 20, closesAt: "2020-01-02T00:00:00Z" },
  };
  const opening = { openedAt: "2020-01-01T00:00:00Z" };
  const rows = cases.map((c) => ({
    id: c.id,
    votesA: 15,
    votesB: 5,
    collectionStartedAt: "2020-01-01T01:00:00Z",
    closedAt: "2020-01-02T01:00:00Z",
    source: "Synthetic unit test ONLY",
    artifactSha256: "test",
    audienceMatched: true,
    randomizedOrder: true,
    deduplicated: true,
  }));
  return { lock, opening, rows };
}
test("paired scoring counts discordant cases and exact test, not unpaired voters", () => {
  const { lock, opening, rows } = study();
  const r = summarizeStudy(lock, opening, rows);
  assert.equal(r.evaluated, 20);
  assert.equal(r.aiCorrect, 10);
  assert.equal(r.qlooCorrect, 20);
  assert.equal(r.qlooOnly, 10);
  assert.equal(r.exactMcNemarP, 2 / 1024);
});
test("missing cases, ties and low responses remain explicit; predicted ties are wrong", () => {
  const { lock, opening, rows } = study();
  rows.pop();
  rows[0].votesA = 10;
  rows[0].votesB = 10;
  rows[1].votesA = 9;
  rows[1].votesB = 1;
  lock.cases[2].predictions.qloo.choice = "tie";
  const r = summarizeStudy(lock, opening, rows);
  assert.equal(r.evaluated, 17);
  assert.equal(r.excluded.length, 3);
  assert.equal(r.qlooCorrect, 16);
  assert.match(r.claim, /Pilot/);
});
test("rejects leaked timing, unchecked audience, duplicate and unknown results", () => {
  for (const mutate of [
    (s) => (s.rows[0].collectionStartedAt = "2019-01-01"),
    (s) => (s.rows[0].closedAt = "2020-01-01"),
    (s) => (s.rows[0].audienceMatched = false),
    (s) => s.rows.push(s.rows[0]),
    (s) => (s.rows[0].id = "unknown"),
  ]) {
    const s = study();
    mutate(s);
    assert.throws(() => summarizeStudy(s.lock, s.opening, s.rows));
  }
});
test("drafts and unresolved mock entities cannot be locked", () => {
  assert.throws(
    () =>
      validateDraft({
        cases: Array.from({ length: 25 }, (_, i) => ({ id: `c${i}` })),
        protocol: {
          minimumVotes: 20,
          closesAt: new Date(Date.now() + 86400000).toISOString(),
          recruitment: "screened",
          duplicatePolicy: "dedupe",
          aiPromptPolicy: "blind",
          qlooScoringPolicy: "fixed",
        },
      }),
    /ready/,
  );
});
test("historical rehearsal reports correct aggregate counts, not model superiority", () => {
  assert.throws(() => makeCookieCommit({ choice: "A" }));
  const r = makeCookieCommit({
    choice: "B",
    model: "Human hypothesis",
    rationale: "Illustrative only",
    source: "Human",
    confidence: 60,
  });
  assert.equal(r.correct, undefined);
  assert.equal(r.result, undefined);
  assert.equal(r.confidence, 60);
  assert.equal(
    cookieCats.groups.reduce((s, g) => s + g.players, 0),
    90189,
  );
  assert.equal(cookieCats.groups[0].day7, 8502);
  assert.match(r.purpose, /not a model benchmark/);
  assert.ok(Date.parse(r.committedAt));
});
test("confidence has explicit gap thresholds and is too close below 10 points", () => {
  const scores = (gap) => [
    { score: 50 + gap, components: { affinity: 20 } },
    { score: 50, components: { affinity: 17 } },
  ];
  assert.equal(predictionConfidence(scores(9)).tooClose, true);
  assert.equal(predictionConfidence(scores(10)).level, "Moderate");
  assert.equal(predictionConfidence(scores(25)).level, "High");
  assert.equal(predictionConfidence(scores(0)).tooClose, true);
  assert.equal(predictionConfidence(scores(30)).affinityGap, 3);
});

test("CLI locks artifacts before opening, refuses overwrites and detects tampering", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tastetest-research-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, "artifact.json"),
    JSON.stringify({
      fixture: "Synthetic test only. Never benchmark evidence.",
    }),
  );
  const prediction = {
    choice: "A",
    model: "Synthetic test fixture",
    mode: "real",
    rationale: "Unit test only",
    generatedAt: new Date().toISOString(),
    artifact: "artifact.json",
  };
  const draft = {
    protocol: {
      minimumVotes: 20,
      closesAt: new Date(Date.now() + 60000).toISOString(),
      recruitment: "test",
      duplicatePolicy: "test",
      aiPromptPolicy: "test",
      qlooScoringPolicy: "test",
    },
    cases: Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      status: "ready",
      audience: "test",
      seeds: Array.from({ length: 3 }, (_, j) => ({
        name: `s${j}`,
        entityId: `fixture-${j}`,
      })),
      options: [
        { title: "A", description: "Test A", entityIds: ["fixture-a"] },
        { title: "B", description: "Test B", entityIds: ["fixture-b"] },
      ],
      predictions: { ai: { ...prediction }, qloo: { ...prediction } },
    })),
  };
  await writeFile(path.join(directory, "draft.json"), JSON.stringify(draft));
  const run = (...args) =>
    spawnSync(process.execPath, ["research/study.mjs", ...args], {
      encoding: "utf8",
    });
  assert.equal(run("open", directory).status, 1);
  assert.equal(run("lock", directory).status, 0);
  assert.equal(run("lock", directory).status, 1);
  const manifest = JSON.parse(
    await readFile(path.join(directory, "lock-manifest.json"), "utf8"),
  );
  const receipt = path.join(directory, "receipt.json");
  await writeFile(
    receipt,
    JSON.stringify({
      sha256: manifest.sha256,
      timestamp: new Date().toISOString(),
      reference: "Synthetic receipt; unit test only",
    }),
  );
  assert.equal(run("open", directory, receipt).status, 0);
  assert.equal(run("open", directory, receipt).status, 1);
  await writeFile(path.join(directory, "locked.json"), "{}");
  const tampered = run("score", directory, receipt);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stderr, /changed/);
});
