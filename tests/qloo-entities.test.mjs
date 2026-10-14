import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApi } from "../server/api.mjs";
import { fileStore } from "../server/storage.mjs";
import { receiptHash } from "../server/aiComparison.mjs";
import { sampleInput, typeUrns } from "../server/fixtures.mjs";
import { mockQlooAdapter } from "../server/qlooAdapter.mjs";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];
const candidates = ids.map((entity_id, i) => ({
  entity_id,
  name: `Confirmed movie ${i ? "B" : "A"}`,
  types: [typeUrns["Film/TV"]],
  category: "Film/TV",
  tags: [],
}));
const input = {
  ...sampleInput,
  creationMode: "quick",
  compareAi: true,
  comparisonKind: "entities",
  insightCategory: "Film/TV",
  options: sampleInput.options.map((o, i) => ({
    ...o,
    title: "Untrusted submitted title",
    entityId: ids[i],
  })),
};
async function fixture(
  t,
  {
    affinities = [0.8, 0.3],
    missing = false,
    wrongCategory = false,
    mode = "real",
    profileState = "available",
  } = {},
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "direct-qloo-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const contexts = [],
    queries = [];
  const api = createApi(fileStore(dir), {
    adapter: {
      ...mockQlooAdapter,
      async getTasteProfile(seedIds, targetType) {
        assert.deepEqual(seedIds, input.seedEntityIds);
        assert.equal(
          targetType,
          input.insightCategory === "Film/TV"
            ? typeUrns["Film/TV"]
            : targetType,
        );
        if (profileState === "error")
          throw Error("Synthetic transport failure");
        return {
          mode: "real",
          status: profileState,
          targetType,
          tagType: "urn:tag:genre:media",
          tags:
            profileState === "available"
              ? [
                  {
                    tag_id: "urn:tag:genre:media:drama",
                    name: "Fixture Drama",
                    affinity: 0.9,
                  },
                ]
              : [],
        };
      },
      async resolveEntities(entityIds) {
        if (entityIds[0] === ids[0])
          return candidates
            .map((e) => ({
              ...e,
              types: wrongCategory ? [typeUrns.Music] : e.types,
            }))
            .reverse();
        return mockQlooAdapter.resolveEntities(entityIds);
      },
      async getInsights(seedIds, targetTypes, candidateIds) {
        queries.push({ seedIds, targetTypes, candidateIds });
        return {
          mode,
          fetchedAt: "2026-10-13T12:00:00Z",
          targetTypes,
          results: {
            entities: candidates
              .map((c, i) => ({ ...c, query: { affinity: affinities[i] } }))
              .slice(0, missing ? 1 : 2)
              .reverse(),
          },
        };
      },
      async scoreOption() {
        throw Error("Direct affinity must never call local scoring");
      },
    },
    aiPredictor: async (context) => {
      contexts.push(context);
      return {
        choice: "A",
        confidence: 60,
        rationale: "Synthetic test fixture, not a real prediction.",
        model: "fixture-model",
        prompt: { input: JSON.stringify(context) },
      };
    },
  });
  const call = async (route, method = "GET", body, token) => {
    const response = await api(
      new Request(`http://localhost/api${route}`, {
        method,
        headers: token ? { "x-owner-token": token } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  return { call, contexts, queries };
}
test("confirmed options use direct Qloo affinity in A/B order, canonical names and immutable receipt", async (t) => {
  const { call, contexts, queries } = await fixture(t);
  const response = await call("/tests", "POST", input);
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const { test: result, ownerToken } = response.data;
  assert.deepEqual(queries, [
    {
      seedIds: input.seedEntityIds,
      targetTypes: [typeUrns["Film/TV"]],
      candidateIds: ids,
    },
  ]);
  assert.deepEqual(
    result.prediction.map((s) => s.score),
    [80, 30],
  );
  assert.deepEqual(
    result.options.map((o) => o.title),
    candidates.map((c) => c.name),
  );
  assert.equal(result.scoringVersion, "qloo-candidate-affinity-v1");
  assert.equal(result.provenance.qlooFallback, false);
  assert.equal(result.provenance.qlooOptionSignal, true);
  assert.equal(result.provenance.fallbackLabel, null);
  assert.equal(
    result.comparison.payload.qloo.source,
    "Direct Qloo entity affinity",
  );
  assert.equal(result.comparison.payload.qloo.choice, "A");
  assert.deepEqual(
    result.comparison.payload.qloo.affinities.map((a) => a.affinity),
    [0.8, 0.3],
  );
  assert.equal(contexts.length, 2);
  const { qlooSignals: baseline, ...commonA } = contexts[0];
  const { qlooSignals: agent, ...commonB } = contexts[1];
  assert.equal(baseline, null);
  assert.deepEqual(commonA, commonB);
  assert.deepEqual(
    agent.candidates.map((c) => c.entityId),
    ids,
  );
  assert.equal(agent.method, "direct-entity-affinity");
  assert.equal(agent.tasteProfile.tags[0].name, "Fixture Drama");
  assert.equal(result.comparison.payload.qlooEvidence.source, "Qloo API");
  assert.deepEqual(
    result.comparison.payload.qlooEvidence.tasteProfile,
    agent.tasteProfile,
  );
  const tampered = structuredClone(result.comparison.payload);
  tampered.qlooEvidence.tasteProfile.tags[0].affinity = 0.1;
  assert.notEqual(receiptHash(tampered), result.comparison.sha256);
  assert.equal(
    result.comparison.sha256,
    receiptHash(result.comparison.payload),
  );
  const reloaded = (
    await call(`/tests/${result.id}`, "GET", undefined, ownerToken)
  ).data;
  assert.deepEqual(reloaded.comparison, result.comparison);
  assert.equal((await call(`/tests/${result.id}`)).data.comparison, undefined);
  assert.ok(result.predictionWork.steps.every((s) => s.status === "done"));
  assert.equal(result.benchmarkMetadata.track, "rehearsal");
});
test("empty or failed Taste Analysis is recorded honestly while primary Qloo evidence remains usable", async (t) => {
  for (const profileState of ["empty", "error"]) {
    const { call, contexts } = await fixture(t, { profileState });
    const response = await call("/tests", "POST", input);
    assert.equal(response.status, 201, JSON.stringify(response.data));
    const profile =
      response.data.test.comparison.payload.qlooEvidence.tasteProfile;
    assert.equal(
      profile.status,
      profileState === "error" ? "unavailable" : "empty",
    );
    assert.deepEqual(profile.tags, []);
    assert.equal(contexts[0].qlooSignals, null);
    assert.equal(contexts[1].qlooSignals.tasteProfile.status, profile.status);
    assert.equal(response.data.test.comparison.payload.qloo.choice, "A");
  }
});
test("missing direct signal, wrong category or mock data fail before AI instead of silently substituting a text score", async (t) => {
  for (const config of [
    { missing: true },
    { wrongCategory: true },
    { mode: "mock" },
  ]) {
    const { call, contexts } = await fixture(t, config);
    const response = await call("/tests", "POST", input);
    assert.ok(response.status >= 400);
    assert.equal(contexts.length, 0);
    assert.equal(response.data.test, undefined);
    assert.ok(
      response.data.predictionWork.steps.some((s) => s.status === "failed"),
    );
  }
});
test("direct comparison rejects unconfirmed, duplicate, seed-overlapping and invalid IDs before requesting affinity", async (t) => {
  const { call, queries, contexts } = await fixture(t);
  for (const body of [
    { ...input, compareAi: false },
    {
      ...input,
      options: input.options.map((o) => ({ ...o, entityId: undefined })),
    },
    {
      ...input,
      options: input.options.map((o) => ({ ...o, entityId: ids[0] })),
    },
    { ...input, seedEntityIds: [ids[0], ...input.seedEntityIds.slice(1)] },
    { ...input, seedEntityIds: [42, ...input.seedEntityIds.slice(1)] },
  ])
    assert.equal((await call("/tests", "POST", body)).status, 400);
  assert.equal(queries.length, 0);
  assert.equal(contexts.length, 0);
});
test("new Qloo receipts pick the higher affinity at small gaps and abstain only on equal scores", async (t) => {
  for (const affinities of [
    [0.8, 0.79],
    [0.79, 0.8],
    [0.80000001, 0.8],
    [0.8, 0.80000001],
    [0.8, 0.8],
    [0, 0],
  ]) {
    const { call } = await fixture(t, { affinities });
    const response = await call("/tests", "POST", input);
    assert.equal(response.status, 201, JSON.stringify(response.data));
    const qloo = response.data.test.comparison.payload.qloo;
    assert.equal(
      qloo.choice,
      affinities[0] === affinities[1]
        ? "TIE"
        : affinities[0] > affinities[1]
          ? "A"
          : "B",
    );
    assert.equal(qloo.decisionPolicy, "higher-score-v1");
    assert.equal(qloo.lowSeparation, true);
    assert.equal(qloo.confidence, 40);
    assert.equal(qloo.fallback, false);
    assert.equal(qloo.noSignalTie, affinities[0] === 0);
  }
});
