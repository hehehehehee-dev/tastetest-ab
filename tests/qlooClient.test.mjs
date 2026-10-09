import { test } from "node:test";
import assert from "node:assert/strict";
import { createQlooClient } from "../server/qlooClient.mjs";
const id = "00000000-0000-4000-8000-000000000001";
const entity = {
  entity_id: id,
  name: "Synthetic transport fixture",
  types: ["urn:entity:artist"],
  tags: [{ name: "Indie Folk", tag_id: "urn:tag:fixture:indie" }],
};
const json = (body) => new Response(JSON.stringify(body), { status: 200 });
test("real transport normalizes search arrays, resolves IDs, and coalesces concurrent calls", async () => {
  let calls = 0;
  const client = createQlooClient({
    key: "UNIT-TEST-NOT-A-CREDENTIAL",
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.hostname, "hackathon.api.qloo.com");
      assert.equal(options.headers["X-Api-Key"], "UNIT-TEST-NOT-A-CREDENTIAL");
      assert.equal(options.redirect, "error");
      return json({ results: [entity] });
    },
  });
  const [a, b] = await Promise.all([
    client.searchEntities("fixture", "Music"),
    client.searchEntities("fixture", "Music"),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(a.mode, "real");
  assert.equal(a.results.entities[0].tags[0].name, "indie folk");
  assert.equal((await client.resolveEntities([id]))[0].entity_id, id);
  await client.searchEntities("fixture", "Music");
  assert.equal(calls, 2);
});
test("Insights supplies supported GET params and preserves actual affinities and explainability", async () => {
  const client = createQlooClient({
    key: "fixture",
    fetchImpl: async (url, options) => {
      assert.equal(url.pathname, "/v2/insights");
      assert.equal(options.method || "GET", "GET");
      assert.equal(options.body, undefined);
      assert.equal(options.headers["X-Api-Key"], "fixture");
      assert.equal(url.searchParams.has("X-Api-Key"), false);
      assert.equal(url.searchParams.get("signal.interests.entities"), id);
      assert.equal(url.searchParams.get("filter.type"), "urn:entity:artist");
      return json({
        success: true,
        results: {
          entities: [
            {
              id,
              name: "Synthetic insight fixture",
              tags: [{ id: "urn:tag:fixture", name: "Folk" }],
              query: { affinity: 0.42, explainability: { fixture: true } },
            },
          ],
        },
      });
    },
  });
  const data = await client.getInsights([id], ["urn:entity:artist"]);
  assert.equal(data.results.entities[0].query.affinity, 0.42);
  assert.equal(data.results.entities[0].entity_id, id);
  assert.ok(data.fetchedAt);
  assert.equal(data.results.entities[0].query.explainability.fixture, true);
});
test("missing key, mock IDs and unapproved origin never send a credential", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return json({ results: [] });
  };
  await assert.rejects(
    () => createQlooClient({ fetchImpl }).searchEntities("fixture"),
    /QLOO_API_KEY/,
  );
  await assert.rejects(
    () =>
      createQlooClient({ key: "fixture", fetchImpl }).getInsights([
        "mock-artist",
      ]),
    /mock IDs/,
  );
  await assert.rejects(
    () =>
      createQlooClient({
        key: "fixture",
        fetchImpl,
        baseUrl: "https://example.com",
      }).searchEntities("fixture"),
    /approved/,
  );
  assert.equal(calls, 0);
});

test("candidate affinity sends exact result IDs with seed IDs and no rating outcomes", async () => {
  const candidate = "00000000-0000-4000-8000-000000000002";
  const client = createQlooClient({
    key: "UNIT-TEST-NOT-A-CREDENTIAL",
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("filter.results.entities"), candidate);
      assert.equal(url.searchParams.get("signal.interests.entities"), id);
      assert.equal(url.searchParams.get("take"), "1");
      assert.equal(url.searchParams.get("feature.explainability"), "true");
      assert.equal(
        [...url.searchParams.keys()].some((k) => /rating|outcome/.test(k)),
        false,
      );
      return json({
        results: [
          { ...entity, entity_id: candidate, query: { affinity: 0.73 } },
        ],
      });
    },
  });
  const result = await client.getInsights(
    [id],
    ["urn:entity:movie"],
    [candidate],
  );
  assert.equal(result.results.entities[0].query.affinity, 0.73);
  assert.deepEqual(result.candidateIds, [candidate]);
});
test("authentication, quota and schema failures are explicit, sanitized, with no fallback/retry", async () => {
  for (const [status, pattern] of [
    [401, /credential/],
    [429, /rate limit/],
    [500, /upstream/],
  ]) {
    let calls = 0;
    const c = createQlooClient({
      key: "fixture",
      fetchImpl: async () => {
        calls++;
        return new Response("Potential secret echo", { status });
      },
    });
    await assert.rejects(() => c.searchEntities("fixture"), pattern);
    assert.equal(calls, 1);
  }
  const c = createQlooClient({
    key: "fixture",
    fetchImpl: async () =>
      json({
        success: true,
        results: { entities: [{ ...entity, query: { affinity: 12 } }] },
      }),
  });
  await assert.rejects(
    () => c.getInsights([id], ["urn:entity:artist"]),
    /affinity/,
  );
});
test("a quota cooldown blocks subsequent requests rather than ignoring Retry-After", async () => {
  let calls = 0;
  const client = createQlooClient({
    key: "fixture",
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "3600" },
      });
    },
  });
  await assert.rejects(() => client.searchEntities("first"), /rate limit/);
  await assert.rejects(() => client.searchEntities("second"), /rate limit/);
  assert.equal(calls, 1);
});
