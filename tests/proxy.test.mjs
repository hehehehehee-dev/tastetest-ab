import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  generateProxyCases,
  csvRows,
  DEFAULT_RULES,
} from "../scripts/build-proxy-cases.mjs";
import { createApi } from "../server/api.mjs";
import { fileStore } from "../server/storage.mjs";
import { mockQlooAdapter } from "../server/qlooAdapter.mjs";
import {
  seedProxyOutcomes,
  proxyTally,
  validateProxyOutcomes,
  predictProxy,
} from "../server/proxy.mjs";
const fixture = () => {
  const movies = Array.from({ length: 8 }, (_, i) => ({
    movieId: String(i + 1),
    title: `Fixture Movie ${i + 1} (1995)`,
    genres: ["Drama", "Crime"],
  }));
  const ratings = movies.flatMap((movie, i) =>
    Array.from({ length: 500 }, (_, user) => ({
      movieId: movie.movieId,
      userId: String(user + 1),
      rating: user < 40 ? (i === 7 ? 3 : i === 6 ? 5 : 4.5) : 2.5,
    })),
  );
  return { movies, ratings };
};
const generate = () => {
  const { movies, ratings } = fixture();
  return generateProxyCases(movies, ratings, {
    rules: { ...DEFAULT_RULES, count: 4 },
    seed: "unit-synthetic-fixture",
    dataset: "synthetic-fixture",
  });
};
test("seeded proxy generation obeys every threshold, stays deterministic and keeps outcomes out of inputs", () => {
  const { inputs, hidden } = generate();
  assert.deepEqual(generate(), { inputs, hidden });
  assert.equal(inputs.cases.length, 4);
  for (const row of hidden.outcomes) {
    assert.ok(row.segmentUsers >= 30);
    assert.ok(row.gap >= 0.3);
    for (const option of row.options) {
      assert.ok(option.count >= 20);
      assert.ok(option.overallRatings >= 500);
    }
    assert.ok(
      Math.max(...row.options.map((o) => o.overallRatings)) /
        Math.min(...row.options.map((o) => o.overallRatings)) <=
        1.5,
    );
  }
  assert.equal(
    /"(?:actual|mean|segmentUsers|overallRatings|gap)"\s*:/.test(
      JSON.stringify(inputs.cases),
    ),
    false,
  );
  const { movies, ratings } = fixture();
  assert.throws(
    () =>
      generateProxyCases(
        movies,
        ratings.filter((r) => Number(r.userId) <= 499),
        { rules: { ...DEFAULT_RULES, count: 1 } },
      ),
    />=500/,
  );
  assert.deepEqual(
    csvRows(
      'movieId,title,genres\n1,"Title, with ""quotes"" (1995)",Drama\r\n',
    ),
    [
      ["movieId", "title", "genres"],
      ["1", 'Title, with "quotes" (1995)', "Drama"],
    ],
  );
});
test("generation rejects too-small audience, insufficient segment ratings, small gaps and dissimilar popularity", () => {
  const { movies, ratings } = fixture();
  for (const changed of [
    { minUsers: 41 },
    { minSegmentRatings: 41 },
    { minGap: 3 },
    { minOverallRatings: 501 },
  ])
    assert.throws(
      () =>
        generateProxyCases(movies, ratings, {
          rules: { ...DEFAULT_RULES, ...changed, count: 1 },
          maxAttempts: 100,
        }),
      /Cannot generate|valid cases/,
    );
  const result = generate();
  const broken = structuredClone(result.hidden);
  broken.outcomes[0].options[0].overallRatings = 1000;
  assert.throws(
    () => validateProxyOutcomes(result.inputs, broken),
    /popularity/,
  );
});
test("proxy admin seeding, ownership, freeze-before-reveal, hidden payloads, immutable outcomes and isolated tallies", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tastetest-proxy-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = fileStore(dir),
    { inputs, hidden } = generate();
  const admin = "synthetic-admin-token-not-a-credential-0001";
  const api = createApi(store, {
    adapter: mockQlooAdapter,
    proxyOptions: {
      catalogLoader: async () => inputs,
      mockMode: () => true,
      adminToken: () => admin,
    },
  });
  const call = async (route, method = "GET", body, token, adminToken) => {
    const response = await api(
      new Request(`http://localhost/api${route}`, {
        method,
        headers: {
          ...(token ? { "x-owner-token": token } : {}),
          ...(adminToken ? { "x-proxy-admin-token": adminToken } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call("/proxy/admin/seed", "POST", hidden)).status, 403);
  assert.equal(
    (await call(`/proxy/cases/${inputs.cases[0].id}/start`, "POST", {})).status,
    503,
  );
  assert.equal(
    (await call("/proxy/admin/seed", "POST", hidden, null, admin)).status,
    201,
  );
  assert.equal(
    (await call("/proxy/admin/seed", "POST", hidden, null, admin)).status,
    200,
  );
  const changed = structuredClone(hidden);
  changed.outcomes[0].segmentUsers++;
  assert.equal(
    (await call("/proxy/admin/seed", "POST", changed, null, admin)).status,
    409,
  );
  const { data } = await call(
      `/proxy/cases/${inputs.cases[0].id}/start`,
      "POST",
      {},
    ),
    { run, ownerToken } = data;
  assert.equal(run.outcome, undefined);
  assert.equal(run.result, undefined);
  assert.equal(
    /"(?:actual|mean|overallRatings|segmentUsers)"\s*:/.test(
      JSON.stringify(run),
    ),
    false,
  );
  const base = `/proxy/runs/${run.id}`;
  assert.equal(
    (await call(base + "/reveal", "POST", {}, ownerToken)).status,
    409,
  );
  const freezeBody = {
    beforeReveal: true,
    llm: {
      pick: "A",
      confidence: 60,
      source: "human",
      answer: "Synthetic fixture choice; not real model evidence.",
    },
  };
  assert.equal((await call(base + "/freeze", "POST", freezeBody)).status, 403);
  assert.equal(
    (
      await call(
        base + "/freeze",
        "POST",
        { ...freezeBody, beforeReveal: false },
        ownerToken,
      )
    ).status,
    400,
  );
  const frozen = await call(base + "/freeze", "POST", freezeBody, ownerToken);
  assert.equal(frozen.status, 201);
  assert.equal(frozen.data.freeze.payload.beforeOutcomeConfirmed, false);
  assert.equal(frozen.data.freeze.payload.beforeRevealConfirmed, true);
  assert.equal(frozen.data.outcome, undefined);
  assert.equal(
    (await call(base + "/freeze", "PATCH", freezeBody, ownerToken)).status,
    409,
  );
  const publicRun = (await call(base)).data;
  assert.equal(publicRun.freeze, undefined);
  assert.equal(publicRun.prediction, undefined);
  const revealed = (await call(base + "/reveal", "POST", {}, ownerToken)).data;
  assert.ok(revealed.outcome);
  assert.ok(revealed.result.grades.llm);
  assert.equal(
    (await call(base + "/reveal", "POST", {}, ownerToken)).data.revealedAt,
    revealed.revealedAt,
  );
  assert.equal((await call(base)).data.outcome, undefined);
  const list = (await call("/proxy")).data;
  assert.equal(list.tally.mock.cases, 1);
  assert.equal(list.tally.real.cases, 0);
  assert.equal(
    /"(?:actual|mean|overallRatings|segmentUsers)"\s*:/.test(
      JSON.stringify(list),
    ),
    false,
  );
  const track = (await call("/benchmark")).data;
  assert.equal(track.rows.length, 0);
  assert.deepEqual(track.tally.counts.agent, { correct: 0, total: 0 });
  assert.equal((await store.list("benchmark-results/")).length, 0);
});
test("proxy tally separates mock/real runs and counts one first freeze per case/mode", () => {
  const row = {
    id: "a",
    caseId: "PX-001",
    mode: "real-qloo",
    frozenAt: "2026-01-01",
    result: { grades: { llm: "✗", qloo: "✓", agent: "ABSTAIN" } },
  };
  const result = proxyTally([
    row,
    {
      ...row,
      id: "b",
      frozenAt: "2026-01-02",
      result: { grades: { llm: "✓", qloo: "✗", agent: "✓" } },
    },
    { ...row, id: "c", mode: "mock" },
  ]);
  assert.deepEqual(result.real.counts.llm, { correct: 0, total: 1 });
  assert.deepEqual(result.real.decisionCounts.agent, {
    correct: 0,
    total: 0,
    abstained: 1,
    cases: 1,
  });
  assert.equal(result.mock.cases, 1);
  assert.equal(result.attempts, 3);
});
test("real-shaped movie resolution uses the existing adapter and never receives MovieLens outcomes", async () => {
  const input = generate().inputs.cases[0],
    contexts = [];
  let searches = 0;
  const adapter = {
    searchEntities: async (title, type) => {
      searches++;
      assert.equal(type, "Film/TV");
      return {
        results: {
          entities: [
            {
              entity_id: `00000000-0000-4000-8000-${String(1000 + searches).padStart(12, "0")}`,
              name: title,
              releaseYear: 2019,
              tags: [],
              category: "Film/TV",
            },
            {
              entity_id: `00000000-0000-4000-8000-${String(searches).padStart(12, "0")}`,
              name: title,
              releaseYear: 1995,
              tags: [{ name: "drama" }],
              category: "Film/TV",
            },
          ],
        },
      };
    },
    getInsights: async (ids, types, candidateIds) => {
      assert.equal(ids.length, 3);
      assert.deepEqual(types, ["urn:entity:movie"]);
      assert.equal(candidateIds.length, 2);
      contexts.push({ ids, candidateIds });
      return {
        mode: "real",
        fetchedAt: "2026-10-09T12:00:00Z",
        results: {
          entities: candidateIds.map((entity_id, i) => ({
            entity_id,
            name: `Candidate ${i}`,
            query: {
              affinity: i ? 0.2 : 0.8,
              explainability: { fixture: true },
            },
          })),
        },
      };
    },
    scoreOption: async (option, profile) => {
      throw Error("Direct movie affinity must not call lexical scoring.");
    },
  };
  const result = await predictProxy(input, adapter, false);
  assert.equal(searches, 5);
  assert.equal(result.mode, "real");
  assert.equal(contexts.length, 1);
  assert.deepEqual(
    result.prediction.map((p) => p.score),
    [80, 20],
  );
  assert.equal(result.provenance.affinities[0].affinity, 0.8);
  assert.equal(result.provenance.fetchedAt, "2026-10-09T12:00:00Z");
  assert.equal(result.scoringVersion, "qloo-candidate-affinity-v1");
  assert.equal(JSON.stringify(contexts).includes('"mean"'), false);
  adapter.getInsights = async () => ({
    mode: "real",
    results: { entities: [] },
  });
  await assert.rejects(
    () => predictProxy(input, adapter, false),
    /No substitute score/,
  );
});
