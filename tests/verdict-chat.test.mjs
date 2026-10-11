import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileStore } from "../server/storage.mjs";
import { createApi } from "../server/api.mjs";
import { sampleInput } from "../server/fixtures.mjs";
import {
  composeVerdictChatAnswer,
  createVerdictChat,
  proxyChatContext,
  verdictChatCapReply,
  verdictChatScopeReply,
} from "../server/verdictChat.mjs";

const context = {
  kind: "proxy-film",
  caseId: "PX-001",
  label: "PX-001",
  options: [
    { label: "A", name: "Candidate Alpha" },
    { label: "B", name: "Candidate Beta" },
  ],
  seeds: ["Seed One", "Seed Two", "Seed Three"],
  signals: [
    { name: "Candidate Alpha affinity", affinity: 0.91 },
    { name: "Candidate Beta affinity", affinity: 0.62 },
  ],
  branches: {
    llm: { pick: "B", confidence: 58, gap: null, source: "GPT-5" },
    qloo: { pick: "A", confidence: 80, gap: 29, source: "Qloo" },
    agent: { pick: "A", confidence: 80, gap: 29, source: "Qloo" },
  },
  outcome: {
    actual: "A",
    segmentUsers: 42,
    metric: "mean rating",
    options: [
      { label: "A", mean: 4.3, observations: 30 },
      { label: "B", mean: 3.7, observations: 28 },
    ],
  },
  freeze: {
    timestamp: "2026-10-11T12:00:00.000Z",
    hash: "a".repeat(64),
  },
};

test("why answer names the actual strongest frozen affinity signals", () => {
  const answer = composeVerdictChatAnswer("Why did you pick A?", context, {
    scope: "in-scope",
    intent: "why",
  });
  assert.match(answer, /Candidate Alpha affinity/);
  assert.match(answer, /Candidate Beta affinity/);
  assert.match(answer, /Option A/);
  assert.match(answer, /do not prove future accuracy/);
});

test("out-of-scope questions get the fixed honesty reply without calling AI", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tastetest-chat-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const chat = createVerdictChat({
    store: fileStore(directory),
    responder: async () => {
      calls++;
      return { scope: "in-scope", intent: "general" };
    },
  });
  const result = await chat({
    verdictKey: "proxy-film:fixture",
    sessionId: randomUUID(),
    question: "Who will win the election?",
    context,
  });
  assert.equal(result.answer, verdictChatScopeReply);
  assert.equal(calls, 0);
});

test("the server refuses the eleventh message and stores no question history", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tastetest-chat-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = fileStore(directory);
  let calls = 0;
  const chat = createVerdictChat({
    store,
    responder: async () => {
      calls++;
      return { scope: "in-scope", intent: "confidence" };
    },
  });
  const sessionId = randomUUID();
  for (let index = 0; index < 10; index++) {
    const result = await chat({
      verdictKey: "proxy-film:fixture",
      sessionId,
      question: "How confident should I be?",
      context,
    });
    assert.equal(result.count, index + 1);
    assert.equal(result.capped, false);
  }
  const refused = await chat({
    verdictKey: "proxy-film:fixture",
    sessionId,
    question: "Why did you pick A?",
    context,
  });
  assert.deepEqual(refused, {
    answer: verdictChatCapReply,
    count: 10,
    capped: true,
  });
  assert.equal(calls, 10);
  const keys = await store.list("verdict-chat-count/");
  assert.equal(keys.length, 10);
  for (const key of keys)
    assert.deepEqual(Object.keys(await store.get(key)), ["expiresAt"]);
});

test("proxy context is unavailable before reveal and exposes only frozen facts", () => {
  assert.throws(
    () => proxyChatContext({}, null, null, null),
    /after the proxy reveal/,
  );
  const built = proxyChatContext(
    {
      id: "run",
      proxyCaseId: "PX-001",
      proxyDomain: "film",
      options: [{ title: "A" }, { title: "B" }],
      input: { seeds: [{ title: "Seed" }] },
    },
    {
      sha256: "b".repeat(64),
      payload: {
        frozenAt: "2026-10-11T12:00:00.000Z",
        branches: context.branches,
        provenance: { affinities: context.signals },
      },
    },
    { grades: { qloo: "✓" } },
    context.outcome,
  );
  assert.deepEqual(built.signals, context.signals);
  assert.equal("question" in built, false);
});

test("Track B chat route stays closed before verdict and rebuilds context server-side", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tastetest-chat-api-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const api = createApi(fileStore(directory), {
    chatResponder: async () => ({ scope: "in-scope", intent: "why" }),
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
    benchmarkMetadata: {
      track: "track-b",
      caseLabel: "TB-CHAT",
      unpublished: true,
      audienceVerified: true,
    },
  });
  const { id } = created.data.test;
  const sessionId = randomUUID();
  assert.equal(
    (
      await call(`/tests/${id}/chat`, "POST", {
        sessionId,
        question: "Why did you pick A?",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `/tests/${id}/freeze`,
        "POST",
        {
          beforeOutcome: true,
          llm: {
            pick: "A",
            confidence: 60,
            source: "fixture",
            answer: "Fixture answer recorded before the outcome.",
          },
        },
        created.data.ownerToken,
      )
    ).status,
    201,
  );
  await call(`/tests/${id}/open`, "POST", {}, created.data.ownerToken);
  await call(`/tests/${id}/close`, "POST", {}, created.data.ownerToken);
  const answer = await call(`/tests/${id}/chat`, "POST", {
    sessionId,
    question: "Why did you pick A?",
  });
  assert.equal(answer.status, 200);
  assert.match(answer.data.answer, /Small-batch & handmade/);
  assert.match(answer.data.answer, /Slow weekend rituals/);
  assert.equal(answer.data.count, 1);
});
