import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  createAiPredictor,
  createComparison,
  receiptHash,
  scoreComparison,
} from "../server/aiComparison.mjs";
import { createApi } from "../server/api.mjs";
import { fileStore } from "../server/storage.mjs";
import { mockQlooAdapter } from "../server/qlooAdapter.mjs";
import { sampleInput } from "../server/fixtures.mjs";

const decision = (choice, context) => ({
  choice,
  confidence: 60,
  rationale: "Synthetic fixture only, never a real prediction.",
  model: "fixture-model-v1",
  responseId: randomUUID(),
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  prompt: { instructions: "test fixture", input: JSON.stringify(context) },
});
const realShapedAdapter = {
  ...mockQlooAdapter,
  async getInsights(ids) {
    return {
      ...(await mockQlooAdapter.getInsights(ids)),
      mode: "real",
      fetchedAt: new Date().toISOString(),
      targetTypes: ["urn:entity:place"],
    };
  },
};
test("two stateless AI calls use identical shared context and only one gets Qloo evidence; receipt detects edits", async () => {
  const contexts = [];
  const seeds = await mockQlooAdapter.resolveEntities(
    sampleInput.seedEntityIds,
  );
  const insights = await realShapedAdapter.getInsights(
    sampleInput.seedEntityIds,
  );
  const receipt = await createComparison(
    sampleInput,
    seeds,
    insights,
    async (context) => {
      contexts.push(context);
      return decision(context.qlooSignals ? "A" : "B", context);
    },
  );
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].qlooSignals, null);
  assert.ok(contexts[1].qlooSignals.recommendations.length);
  const { qlooSignals: a, ...commonA } = contexts[0];
  const { qlooSignals: b, ...commonB } = contexts[1];
  assert.deepEqual(commonA, commonB);
  assert.equal(JSON.stringify(commonA).includes("tags"), false);
  assert.equal(contexts[1].votes, undefined);
  assert.equal(contexts[1].outcome, undefined);
  assert.equal(receipt.sha256, receiptHash(receipt.payload));
  const tampered = structuredClone(receipt.payload);
  tampered.aiOnly.choice = "A";
  assert.notEqual(receipt.sha256, receiptHash(tampered));
  assert.equal(scoreComparison(receipt, [7, 3], true).aiOnly, "MISS");
  assert.equal(scoreComparison(receipt, [7, 3], true).aiQloo, "MATCH");
  assert.equal(scoreComparison(receipt, [2, 1], true).status, "INSUFFICIENT");
  assert.equal(scoreComparison(receipt, [5, 5], true).status, "TIED");
  assert.equal(scoreComparison(receipt, [7, 3], false).status, "PENDING");
  tampered.aiOnly.choice = "TIE";
  assert.equal(
    scoreComparison({ payload: tampered }, [7, 3], true).aiOnly,
    "ABSTAIN",
  );
  await assert.rejects(
    createComparison(
      sampleInput,
      seeds,
      { ...insights, mode: "mock" },
      async () => {
        throw Error("should not call");
      },
    ),
    /requires real Qloo/,
  );
  let calls = 0;
  await assert.rejects(
    createComparison(sampleInput, seeds, insights, async (c) => ({
      ...decision("A", c),
      model: String(++calls),
    })),
    /different model versions/,
  );
});

test("Responses transport uses server key, strict output, no tools or stored state, and rejects partial/refused/invalid results", async () => {
  let count = 0;
  const response = (body) => new Response(JSON.stringify(body));
  const complete = {
    id: "resp-fixture",
    model: "fixture-model-v1",
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              choice: "A",
              confidence: 70,
              rationale: "Fixture decision.",
            }),
          },
        ],
      },
    ],
  };
  const predictor = createAiPredictor({
    key: "FAKE-TEST-KEY",
    model: "fixture-model-v1",
    fetchImpl: async (url, options) => {
      count++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer FAKE-TEST-KEY");
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.model, "fixture-model-v1");
      return response(complete);
    },
  });
  assert.equal((await predictor({ audience: "fixture" })).choice, "A");
  assert.equal(count, 1);
  for (const body of [
    { ...complete, status: "incomplete" },
    {
      ...complete,
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "No" }] },
      ],
    },
    {
      ...complete,
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"choice":"C","confidence":101,"rationale":"bad"}',
            },
          ],
        },
      ],
    },
  ]) {
    await assert.rejects(
      createAiPredictor({
        key: "FAKE",
        model: "fixture",
        fetchImpl: async () => response(body),
      })({}),
      /valid decision/,
    );
  }
  await assert.rejects(
    createAiPredictor({
      model: "fixture",
      fetchImpl: async () => {
        throw Error("must never run");
      },
    })({}),
    /OPENAI_API_KEY/,
  );
  await assert.rejects(
    createAiPredictor({
      key: "FAKE",
      model: "fixture",
      fetchImpl: async () =>
        new Response("secret upstream text", { status: 401 }),
    })({}),
    (e) => !e.message.includes("secret upstream text"),
  );
});

test("paired lifecycle: predictions private before closing, votes blocked until owner opens, immutable receipt and paired grading", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paired-api-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = fileStore(dir);
  let calls = 0;
  const api = createApi(store, {
    adapter: realShapedAdapter,
    aiPredictor: async (c) => {
      calls++;
      return decision(c.qlooSignals ? "A" : "B", c);
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
  const created = await call("/tests", "POST", {
    ...sampleInput,
    compareAi: true,
  });
  assert.equal(created.status, 201);
  const { test: project, ownerToken } = created.data;
  assert.equal(calls, 2);
  assert.equal(project.pollOpenedAt, null);
  const route = `/tests/${project.id}`;
  const publicBefore = (await call(route)).data;
  assert.equal(publicBefore.comparison, undefined);
  assert.equal(publicBefore.prediction, undefined);
  assert.equal(publicBefore.baseline, undefined);
  assert.equal(publicBefore.insights, undefined);
  assert.equal(publicBefore.commitment.sha256, project.comparison.sha256);
  assert.equal(
    (await call(route, "GET", null, ownerToken)).data.comparison.sha256,
    project.comparison.sha256,
  );
  assert.equal(
    (await call(`${route}/vote`, "POST", { option: 0, voterId: randomUUID() }))
      .status,
    409,
  );
  assert.equal((await call(`${route}/open`, "POST")).status, 403);
  const opened = await call(`${route}/open`, "POST", {}, ownerToken);
  assert.equal(opened.status, 200);
  assert.ok(opened.data.pollOpenedAt >= project.comparison.payload.committedAt);
  assert.equal(
    (await call(`${route}/open`, "POST", {}, ownerToken)).data.pollOpenedAt,
    opened.data.pollOpenedAt,
  );
  for (let i = 0; i < 10; i++) {
    const vote = await call(`${route}/vote`, "POST", {
      option: i < 7 ? 0 : 1,
      voterId: randomUUID(),
    });
    assert.equal(vote.status, 200);
    assert.equal(vote.data.comparison, undefined);
  }
  const closed = await call(`${route}/close`, "POST", {}, ownerToken);
  assert.equal(closed.data.verdict.paired.aiOnly, "MISS");
  assert.equal(closed.data.verdict.paired.aiQloo, "MATCH");
  assert.equal(closed.data.comparison.sha256, project.comparison.sha256);
  assert.deepEqual((await call(route)).data.comparison, project.comparison);
  assert.equal(
    (await call(`${route}/open`, "POST", {}, ownerToken)).status,
    409,
  );
  assert.equal(
    (await call(`${route}/vote`, "POST", { option: 1, voterId: randomUUID() }))
      .status,
    409,
  );
  assert.equal(calls, 2);
});

test("failed second branch cannot create a poll or publish a partial prediction", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paired-failure-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = fileStore(dir);
  const api = createApi(store, {
    adapter: realShapedAdapter,
    aiPredictor: async (c) => {
      if (c.qlooSignals)
        throw Object.assign(Error("Provider unavailable"), { status: 503 });
      return decision("A", c);
    },
  });
  const response = await api(
    new Request("http://localhost/api/tests", {
      method: "POST",
      body: JSON.stringify({ ...sampleInput, compareAi: true }),
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await store.list("tests/"), []);
});
