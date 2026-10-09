import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createApi } from "../server/api.mjs";
import { fileStore } from "../server/storage.mjs";
import { sampleInput } from "../server/fixtures.mjs";
import { qlooAdapter } from "../server/qlooAdapter.mjs";
import {
  freezeHash,
  scoreFreeze,
  benchmarkTally,
} from "../server/benchmark.mjs";
const freezeInput = {
  beforeOutcome: true,
  llm: {
    pick: "B",
    confidence: 60,
    source: "human",
    answer: "Synthetic fixture: B will win.",
  },
};
async function preparePoll(call, data) {
  assert.equal(
    (
      await call(
        `/tests/${data.test.id}/freeze`,
        "POST",
        freezeInput,
        data.ownerToken,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call(`/tests/${data.test.id}/open`, "POST", {}, data.ownerToken))
      .status,
    200,
  );
}

async function harness(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tastetest-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = fileStore(directory);
  const api = createApi(store);
  const call = async (pathname, method = "GET", body, token) => {
    const response = await api(
      new Request(`http://localhost/api${pathname}`, {
        method,
        headers: { ...(token ? { "x-owner-token": token } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  return { call, directory };
}
test("sample exposes synthetic, decomposable predictions and a complete verdict", async (t) => {
  const { call } = await harness(t);
  const { data, status } = await call("/sample");
  assert.equal(status, 200);
  assert.equal(data.totalVotes, 52);
  assert.ok(data.closedAt);
  assert.equal(data.mode, "mock");
  assert.ok(data.prediction[0].score > data.prediction[1].score);
  assert.notDeepEqual(
    data.prediction.map((p) => p.score),
    data.baseline.map((p) => p.score),
  );
  for (const result of data.prediction)
    assert.equal(
      result.score,
      result.components.baseline +
        result.components.affinity +
        result.components.tagOverlap +
        result.components.segmentWarning,
    );
  assert.equal(data.verdict.actual, 0);
  assert.equal(data.verdict.share, 71);
});
test("full lifecycle, owner authorization, repeated vote and immutable closure", async (t) => {
  const { call, directory } = await harness(t);
  const created = await call("/tests", "POST", sampleInput);
  assert.equal(created.status, 201);
  const { test: project, ownerToken } = created.data;
  await preparePoll(call, created.data);
  assert.equal(project.ownerHash, undefined);
  assert.equal(project.totalVotes, 0);
  const voter = randomUUID();
  assert.equal((await call(`/tests/${project.id}/close`, "POST")).status, 403);
  assert.equal(
    (
      await call(`/tests/${project.id}/vote`, "POST", {
        option: 0,
        voterId: voter,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/tests/${project.id}/vote`, "POST", {
        option: 1,
        voterId: voter,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/tests/${project.id}/vote`, "POST", {
        option: 2,
        voterId: randomUUID(),
      })
    ).status,
    400,
  );
  // New API instance reads the same persisted data (simulates a server restart).
  const resumed = createApi(fileStore(directory));
  const persisted = await (
    await resumed(new Request(`http://localhost/api/tests/${project.id}`))
  ).json();
  assert.equal(persisted.totalVotes, 1);
  const closed = await call(
    `/tests/${project.id}/close`,
    "POST",
    {},
    ownerToken,
  );
  assert.equal(closed.status, 200);
  assert.equal(closed.data.verdict.actual, 0);
  const again = await call(
    `/tests/${project.id}/close`,
    "POST",
    {},
    ownerToken,
  );
  assert.equal(again.data.closedAt, closed.data.closedAt);
  assert.equal(
    (
      await call(`/tests/${project.id}/vote`, "POST", {
        option: 1,
        voterId: randomUUID(),
      })
    ).status,
    409,
  );
});
test("concurrent unique voters are counted without overwriting each other", async (t) => {
  const { call } = await harness(t);
  const { data } = await call("/tests", "POST", sampleInput);
  const id = data.test.id;
  await preparePoll(call, data);
  const requests = await Promise.all(
    Array.from({ length: 24 }, (_, i) =>
      call(`/tests/${id}/vote`, "POST", {
        option: i % 2,
        voterId: randomUUID(),
      }),
    ),
  );
  assert.ok(requests.every((r) => r.status === 200));
  const result = await call(`/tests/${id}`);
  assert.deepEqual(result.data.votes, [12, 12]);
  const closed = await call(`/tests/${id}/close`, "POST", {}, data.ownerToken);
  assert.equal(closed.data.verdict.actual, null);
  assert.match(closed.data.verdict.recommendation, /tied/);
});
test("empty poll closure reports no evidence, not a fabricated winner", async (t) => {
  const { call } = await harness(t);
  const { data } = await call("/tests", "POST", sampleInput);
  await preparePoll(call, data);
  const closed = await call(
    `/tests/${data.test.id}/close`,
    "POST",
    {},
    data.ownerToken,
  );
  assert.equal(closed.data.verdict.actual, null);
  assert.match(closed.data.verdict.recommendation, /No votes/);
});
test("freeze persists immutable answers; opening and voting require freeze, public readers cannot see answers", async (t) => {
  const { call, directory } = await harness(t);
  const { data } = await call("/tests", "POST", sampleInput);
  const base = `/tests/${data.test.id}`;
  assert.equal(
    (await call(`${base}/open`, "POST", {}, data.ownerToken)).status,
    409,
  );
  assert.equal(
    (await call(`${base}/vote`, "POST", { option: 0, voterId: randomUUID() }))
      .status,
    409,
  );
  assert.equal((await call(`${base}/freeze`, "POST", freezeInput)).status, 403);
  const frozen = await call(
    `${base}/freeze`,
    "POST",
    freezeInput,
    data.ownerToken,
  );
  assert.equal(frozen.status, 201);
  const receipt = frozen.data.freeze;
  assert.equal(receipt.sha256, freezeHash(receipt.payload));
  assert.equal(frozen.data.lifecycle, "predictions frozen");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    assert.equal(
      (
        await call(
          `${base}/freeze`,
          method,
          { ...freezeInput, llm: { ...freezeInput.llm, pick: "A" } },
          data.ownerToken,
        )
      ).status,
      409,
    );
  const resumed = createApi(fileStore(directory));
  const saved = await (
    await resumed(
      new Request(`http://localhost/api${base}`, {
        headers: { "x-owner-token": data.ownerToken },
      }),
    )
  ).json();
  assert.deepEqual(saved.freeze, receipt);
  const publicRead = (await call(base)).data;
  assert.equal(publicRead.freeze, undefined);
  assert.equal(publicRead.prediction, undefined);
  assert.equal(
    (await call(`${base}/open`, "POST", {}, data.ownerToken)).status,
    200,
  );
  assert.equal(
    (await call(`${base}/vote`, "POST", { option: 0, voterId: randomUUID() }))
      .status,
    200,
  );
  const closed = (await call(`${base}/close`, "POST", {}, data.ownerToken))
    .data;
  assert.equal(closed.benchmarkResult.grades.llm, "✗");
  assert.equal(closed.benchmarkResult.eligible, false);
  const benchmark = (await call("/benchmark")).data;
  assert.equal(benchmark.rows.length, 1);
  assert.deepEqual(benchmark.tally.counts.llm, { correct: 0, total: 0 });
  assert.equal(
    JSON.stringify(benchmark).includes(freezeInput.llm.answer),
    false,
  );
  await call(`${base}/close`, "POST", {}, data.ownerToken);
  assert.equal((await call("/benchmark")).data.rows.length, 1);
});
test("manual three-branch freeze requires all original answers and before-outcome timestamp", async (t) => {
  const { call } = await harness(t);
  const { data } = await call("/tests", "POST", sampleInput);
  const base = `/tests/${data.test.id}/freeze`;
  const manual = {
    ...freezeInput,
    mode: "manual",
    originalRecordedAt: "2026-01-01T00:00:00Z",
    qloo: { ...freezeInput.llm, pick: "A" },
    agent: { ...freezeInput.llm, pick: "TIE" },
  };
  assert.equal(
    (await call(base, "POST", { ...manual, qloo: undefined }, data.ownerToken))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        base,
        "POST",
        { ...manual, beforeOutcome: false },
        data.ownerToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        base,
        "POST",
        { ...manual, originalRecordedAt: "2099-01-01" },
        data.ownerToken,
      )
    ).status,
    400,
  );
  const result = await call(base, "POST", manual, data.ownerToken);
  assert.equal(result.status, 201);
  assert.equal(result.data.freeze.payload.mode, "manual");
  assert.deepEqual(scoreFreeze(result.data.freeze, [15, 5]).grades, {
    llm: "✗",
    qloo: "✓",
    agent: "ABSTAIN",
  });
});
test("three-branch grades, 20 votes and 20 eligible cases govern counts; rehearsals never enter", () => {
  const freeze = {
    payload: {
      mode: "real-qloo",
      metadata: { track: "track-b", unpublished: true, audienceVerified: true },
      branches: {
        llm: { pick: "B", confidence: 60 },
        qloo: { pick: "A", confidence: 65 },
        agent: { pick: "A", confidence: 80 },
      },
    },
  };
  const result = scoreFreeze(freeze, [14, 6]);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.grades, { llm: "✗", qloo: "✓", agent: "✓" });
  assert.equal(scoreFreeze(freeze, [13, 6]).eligible, false);
  assert.equal(scoreFreeze(freeze, [10, 10]).eligible, false);
  const rows = Array.from({ length: 19 }, () => ({
    closedAt: "2026-01-01",
    result,
  }));
  assert.equal(benchmarkTally(rows).ready, false);
  assert.deepEqual(benchmarkTally(rows).counts.qloo, {
    correct: 19,
    total: 19,
  });
  const excluded = [
    scoreFreeze(freeze, [13, 6]),
    scoreFreeze({ payload: { ...freeze.payload, mode: "mock" } }, [14, 6]),
    scoreFreeze(
      {
        payload: {
          ...freeze.payload,
          metadata: { ...freeze.payload.metadata, unpublished: false },
        },
      },
      [14, 6],
    ),
  ];
  assert.equal(
    benchmarkTally([
      ...rows,
      ...excluded.map((result) => ({ closedAt: "2026-01-01", result })),
    ]).ready,
    false,
  );
  assert.deepEqual(
    benchmarkTally([...rows, { closedAt: "2026-01-01", result }]).counts,
    {
      llm: { correct: 0, total: 20 },
      qloo: { correct: 20, total: 20 },
      agent: { correct: 20, total: 20 },
    },
  );
});
test("production rejects paid LLM comparison requests regardless of credentials", async (t) => {
  const { call } = await harness(t);
  assert.equal(
    (await call("/tests", "POST", { ...sampleInput, compareAi: true })).status,
    503,
  );
  assert.equal((await call("/config")).data.ai.provider, "manual");
});
test("invalid seeds, duplicate seeds and unsafe image protocols are rejected", async (t) => {
  const { call } = await harness(t);
  for (const seedEntityIds of [
    ["unknown", "unknown2", "unknown3"],
    ["mock-a24", "mock-a24", "mock-cafe"],
    ["mock-a24"],
  ])
    assert.equal(
      (await call("/tests", "POST", { ...sampleInput, seedEntityIds })).status,
      400,
    );
  assert.equal(
    (
      await call("/tests", "POST", {
        ...sampleInput,
        options: [
          { ...sampleInput.options[0], imageUrl: "javascript:alert(1)" },
          sampleInput.options[1],
        ],
      })
    ).status,
    400,
  );
  const all = await call("/search?q=phoebe&type=Music");
  assert.equal(all.data.results.entities.length, 1);
});
test("real mode fails explicitly without making a real API request", async () => {
  const before = process.env.USE_QLOO_MOCK;
  const keyBefore = process.env.QLOO_API_KEY;
  try {
    process.env.USE_QLOO_MOCK = "false";
    delete process.env.QLOO_API_KEY;
    await assert.rejects(
      () => qlooAdapter.searchEntities("Phoebe"),
      /QLOO_API_KEY/,
    );
  } finally {
    if (before === undefined) delete process.env.USE_QLOO_MOCK;
    else process.env.USE_QLOO_MOCK = before;
    if (keyBefore === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = keyBefore;
  }
});
test("historical commit omits outcomes; authenticated reveal never edits the locked answer", async (t) => {
  const { call, directory } = await harness(t);
  const input = {
    choice: "B",
    source: "Human",
    model: "Rehearsal fixture",
    confidence: 70,
    rationale: "Illustrative only",
  };
  assert.equal(
    (
      await call("/historical-case/commit", "POST", {
        ...input,
        confidence: 101,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/historical-case/commit", "POST", {
        ...input,
        confidence: null,
      })
    ).status,
    400,
  );
  const committed = await call("/historical-case/commit", "POST", input);
  assert.equal(committed.status, 201);
  assert.equal(committed.data.result, undefined);
  assert.equal(committed.data.correct, undefined);
  const { id, token } = committed.data;
  const api = createApi(fileStore(directory));
  const request = (method = "GET", action = "", bearer = token) =>
    api(
      new Request(`http://localhost/api/historical-case/${id}${action}`, {
        method,
        headers: { "x-commit-token": bearer },
        ...(method === "POST"
          ? { body: JSON.stringify({ choice: "A", confidence: 100 }) }
          : {}),
      }),
    );
  assert.equal((await request("GET", "", "wrong")).status, 403);
  assert.equal((await (await request()).json()).result, undefined);
  const result = await (await request("POST", "/reveal")).json();
  assert.equal(result.choice, "B");
  assert.equal(result.confidence, 70);
  assert.equal(result.correct, false);
  assert.equal(result.result.rows, 90189);
  assert.equal(
    (await (await request("POST", "/reveal")).json()).revealedAt,
    result.revealedAt,
  );
  assert.equal((await request("POST")).status, 405);
  assert.equal((await (await request()).json()).choice, "B");
});
test("live sample twin is stable, contains only visitor votes and cannot be closed", async (t) => {
  const { call } = await harness(t);
  const [a, b] = await Promise.all([
    call("/sample-live"),
    call("/sample-live"),
  ]);
  assert.equal(a.data.id, b.data.id);
  assert.equal(a.data.closedAt, null);
  assert.equal(a.data.totalVotes, 0);
  assert.equal(a.data.sampleVotes, undefined);
  assert.equal(
    (
      await call(`/tests/${a.data.id}/vote`, "POST", {
        option: 0,
        voterId: randomUUID(),
      })
    ).data.totalVotes,
    1,
  );
  assert.equal(
    (await call(`/tests/${a.data.id}/close`, "POST", {}, "wrong")).status,
    403,
  );
  assert.equal((await call("/sample")).data.totalVotes, 52);
});

test("legacy live-demo poster backfill changes display only and rejects unapproved local image paths", async (t) => {
  const { call, directory } = await harness(t);
  const demo = (await call("/sample-live")).data;
  const store = fileStore(directory);
  const saved = await store.get(`tests/${demo.id}`);
  const legacy = {
    ...saved,
    options: saved.options.map((o) => ({ ...o, imageUrl: "" })),
  };
  await store.set(`tests/${demo.id}`, legacy);
  await call(`/tests/${demo.id}/vote`, "POST", {
    option: 1,
    voterId: randomUUID(),
  });
  const display = (await call(`/tests/${demo.id}`)).data;
  assert.deepEqual(
    display.options.map((o) => o.imageUrl),
    sampleInput.options.map((o) => o.imageUrl),
  );
  assert.deepEqual(display.votes, [0, 1]);
  assert.deepEqual(display.prediction, legacy.prediction);
  assert.deepEqual(await store.get(`tests/${demo.id}`), legacy);
  const invalid = await call("/tests", "POST", {
    ...sampleInput,
    options: [
      { ...sampleInput.options[0], imageUrl: "/private/secret.svg" },
      sampleInput.options[1],
    ],
  });
  assert.equal(invalid.status, 400);
});
