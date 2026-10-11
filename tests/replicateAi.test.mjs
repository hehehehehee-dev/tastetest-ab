import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createReplicateChatResponder,
  createReplicatePredictor,
  replicateModels,
} from "../server/replicateAi.mjs";
const version = "a".repeat(64);
const defaults = {
  minCreateIntervalMs: 0,
  token: "FAKE-REPLICATE-TOKEN",
  model: "openai/gpt-5",
  instructions: "Shared test instructions",
  sleep: async () => {},
};
const json = (body) => new Response(JSON.stringify(body));
const completed = {
  id: "job_fixture_1",
  status: "succeeded",
  version,
  model: "openai/gpt-5",
  output: [
    '{"choice":"A",',
    '"confidence":60,"rationale":"Synthetic transport fixture."}',
  ],
};
test("GPT-5 is the only active Replicate model", async () => {
  assert.deepEqual(replicateModels, ["openai/gpt-5"]);
  let called = false;
  await assert.rejects(
    createReplicatePredictor({
      ...defaults,
      model: "openai/gpt-4.1",
      fetchImpl: async () => {
        called = true;
        return json(completed);
      },
    })({}),
    /supported GPT model/,
  );
  assert.equal(called, false);
});
test("Replicate creation pacing waits before a new job and a quota cooldown prevents further paid creates", async () => {
  const gate = {
    tail: Promise.resolve(),
    lastStartedAt: Date.now(),
    blockedUntil: 0,
  };
  const delays = [];
  const paced = createReplicatePredictor({
    ...defaults,
    gate,
    minCreateIntervalMs: 11000,
    sleep: async (ms) => delays.push(ms),
    fetchImpl: async () => json(completed),
  });
  await paced({});
  assert.ok(delays[0] > 10000);
  const blockedGate = {
    tail: Promise.resolve(),
    lastStartedAt: 0,
    blockedUntil: 0,
  };
  let creates = 0;
  const limited = createReplicatePredictor({
    ...defaults,
    gate: blockedGate,
    fetchImpl: async () => {
      creates++;
      return new Response("private details", {
        status: 429,
        headers: { "Retry-After": "3600" },
      });
    },
  });
  await assert.rejects(limited({}), /quota/);
  await assert.rejects(limited({}), /cooling down/);
  assert.equal(creates, 1);
});
test("Replicate uses the official model endpoint and fixed generation settings, polls the same job, and records exact messages", async () => {
  const requests = [];
  const predictor = createReplicatePredictor({
    ...defaults,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1)
        return json({
          ...completed,
          status: "starting",
          output: null,
          urls: { get: "https://untrusted.example/steal" },
        });
      if (requests.length === 2)
        return json({ ...completed, status: "processing", output: null });
      return json(completed);
    },
  });
  const result = await predictor({ audience: { tastes: ["Fixture"] } });
  assert.equal(result.choice, "A");
  assert.equal(result.provider, "replicate");
  assert.equal(result.model, "openai/gpt-5");
  assert.equal(requests.length, 3);
  assert.equal(requests.filter((x) => x.options.method === "POST").length, 1);
  assert.equal(
    requests[0].url,
    "https://api.replicate.com/v1/models/openai/gpt-5/predictions",
  );
  assert.equal(
    requests[1].url,
    "https://api.replicate.com/v1/predictions/job_fixture_1",
  );
  const body = JSON.parse(requests[0].options.body);
  assert.equal("version" in body, false);
  assert.equal(body.input.reasoning_effort, "minimal");
  assert.equal(body.input.verbosity, "low");
  assert.equal(body.input.max_completion_tokens, 1200);
  assert.equal(body.input.messages[0].content, result.prompt.instructions);
  assert.equal(body.input.messages[1].content, result.prompt.input);
  assert.equal(requests[0].options.headers["Cancel-After"], "45s");
  assert.equal(requests[0].options.redirect, "error");
  assert.equal(JSON.stringify(result).includes(defaults.token), false);
});
test("Replicate rejects malformed output and failed jobs without creating another prediction", async () => {
  for (const response of [
    { ...completed, output: "```json\n{}\n```" },
    {
      ...completed,
      output: '{"choice":"B","confidence":101,"rationale":"invalid"}',
    },
    { ...completed, status: "failed", error: "Private upstream details" },
  ]) {
    let creates = 0,
      cancellations = 0;
    const predictor = createReplicatePredictor({
      ...defaults,
      fetchImpl: async (url, options) => {
        if (url.endsWith("/cancel")) {
          cancellations++;
          return json({});
        }
        if (options.method === "POST") creates++;
        return json(response);
      },
    });
    await assert.rejects(
      predictor({}),
      (e) =>
        e.status === 502 && !e.message.includes("Private upstream details"),
    );
    assert.equal(creates, 1);
    assert.equal(cancellations, 1);
  }
});
test("Replicate hidden official version is recorded honestly, and only accepted with the exact requested model name", async () => {
  const result = await createReplicatePredictor({
    ...defaults,
    fetchImpl: async () => json({ ...completed, version: "hidden" }),
  })({});
  assert.equal(result.returnedVersion, "hidden");
  assert.match(result.versionVerification, /not attested/);
  assert.equal(result.model, "openai/gpt-5");
  await assert.rejects(
    createReplicatePredictor({
      ...defaults,
      fetchImpl: async () =>
        json({ ...completed, version: "hidden", model: "another/model" }),
    })({}),
    /official-model prediction/,
  );
});
test("Replicate timeout cancels only its exact job; auth/quota/config errors are sanitized with no fallback", async () => {
  const urls = [];
  const predictor = createReplicatePredictor({
    ...defaults,
    timeoutMs: 10,
    fetchImpl: async (url) => {
      urls.push(url);
      return json({ ...completed, status: "processing", output: null });
    },
  });
  await assert.rejects(predictor({}), /timed out/);
  assert.deepEqual(urls, [
    "https://api.replicate.com/v1/models/openai/gpt-5/predictions",
    "https://api.replicate.com/v1/predictions/job_fixture_1/cancel",
  ]);
  for (const status of [401, 402, 429]) {
    let calls = 0;
    await assert.rejects(
      createReplicatePredictor({
        ...defaults,
        fetchImpl: async () => {
          calls++;
          return new Response("upstream secret", { status });
        },
      })({}),
      (e) => !e.message.includes("upstream secret"),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    createReplicatePredictor({
      ...defaults,
      fetchImpl: async () => new Response("private details", { status: 401 }),
    })({}),
    /authentication failed/,
  );
  await assert.rejects(
    createReplicatePredictor({
      ...defaults,
      token: "",
      fetchImpl: async () => {
        throw Error("Never call");
      },
    })({}),
    /REPLICATE_API_TOKEN/,
  );
});

test("GPT-5 uses its reasoning schema without unsupported sampling parameters", async () => {
  const result = await createReplicatePredictor({
    ...defaults,
    model: "openai/gpt-5",
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal("version" in body, false);
      assert.ok(Array.isArray(body.input.messages));
      assert.equal(body.input.reasoning_effort, "minimal");
      assert.equal(body.input.verbosity, "low");
      assert.equal(body.input.max_completion_tokens, 1200);
      assert.equal("temperature" in body.input, false);
      assert.equal("top_p" in body.input, false);
      return json({ ...completed, model: "openai/gpt-5" });
    },
  })({ audience: { tastes: ["Synthetic fixture"] } });
  assert.equal(result.requestedModel, "openai/gpt-5");
  assert.equal(result.model, "openai/gpt-5");
});

test("verdict chat reuses official GPT-5 only to classify intent from frozen facts", async () => {
  let requestBody;
  const responder = createReplicateChatResponder({
    ...defaults,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return json({
        ...completed,
        output: '{"scope":"in-scope","intent":"why"}',
      });
    },
  });
  const result = await responder({
    question: "Why did you pick A?",
    facts: { signals: [{ name: "Fixture affinity", affinity: 0.9 }] },
  });
  assert.deepEqual(result, { scope: "in-scope", intent: "why" });
  assert.equal("version" in requestBody, false);
  assert.equal(requestBody.input.reasoning_effort, "minimal");
  assert.equal(requestBody.input.max_completion_tokens, 300);
  assert.match(requestBody.input.messages[0].content, /untrusted data/);
  assert.match(requestBody.input.messages[1].content, /Fixture affinity/);
  assert.equal(JSON.stringify(requestBody).includes(defaults.token), false);
});
