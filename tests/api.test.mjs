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
  const closed = await call(
    `/tests/${data.test.id}/close`,
    "POST",
    {},
    data.ownerToken,
  );
  assert.equal(closed.data.verdict.actual, null);
  assert.match(closed.data.verdict.recommendation, /No votes/);
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
  try {
    process.env.USE_QLOO_MOCK = "false";
    await assert.rejects(() => qlooAdapter.searchEntities(), /not implemented/);
  } finally {
    if (before === undefined) delete process.env.USE_QLOO_MOCK;
    else process.env.USE_QLOO_MOCK = before;
  }
});
