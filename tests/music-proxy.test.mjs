import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApi } from "../server/api.mjs";
import { mockQlooAdapter } from "../server/qlooAdapter.mjs";
import catalog from "../server/data/proxy-lastfm-cases.json" with { type: "json" };
import { validateMusicOutcomes, predictMusic } from "../server/musicProxy.mjs";
test("40 music cases freeze before reveal, never leak outcomes and never merge into film or Track B tallies", async () => {
  const m = new Map();
  const store = {
    get: async (k) => m.get(k),
    set: async (k, v, o) => {
      if (o?.onlyIfNew && m.has(k)) return false;
      m.set(k, v);
      return true;
    },
    list: async (p) => [...m.keys()].filter((k) => k.startsWith(p)),
  };
  const token = "fixture-admin-token-at-least-32-characters";
  const api = createApi(store, {
    adapter: mockQlooAdapter,
    musicOptions: { mockMode: () => true, adminToken: () => token },
  });
  const call = async (p, body, owner) => {
    const r = await api(
      new Request("http://fixture/api" + p, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          "x-owner-token": owner || "",
          "x-proxy-admin-token": token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    return { status: r.status, data: await r.json() };
  };
  // Synthetic outcomes satisfy the real catalog shape; raw listening data is never used by tests.
  const hidden = {
    caseSetHash: catalog.caseSetHash,
    outcomes: catalog.cases.map((c) => ({
      id: c.id,
      dataset: c.dataset,
      segmentUsers: 30,
      options: c.options.map((a, i) => ({
        artistId: a.artistId,
        count: 25,
        overallListeners: 200,
        mean: i ? 100 : 150,
      })),
      relativeGap: 0.5,
      actual: "A",
    })),
  };
  assert.equal((await call("/music-proxy/admin/seed", hidden)).status, 201);
  assert.equal((await call("/music-proxy/admin/seed", hidden)).status, 200);
  assert.throws(
    () =>
      validateMusicOutcomes(catalog, {
        ...hidden,
        outcomes: hidden.outcomes.map((o, i) =>
          i ? o : { ...o, segmentUsers: 29 },
        ),
      }),
    /segment/,
  );
  const listing = await call("/music-proxy");
  assert.equal(listing.data.cases.length, 40);
  assert.doesNotMatch(
    JSON.stringify(listing.data),
    /"(?:mean|actual|segmentUsers|overallListeners)":(?:\d|"[AB]")/,
  );
  for (const c of catalog.cases) {
    const started = await call(`/music-proxy/cases/${c.id}/start`, {});
    assert.equal(started.status, 201);
    const { run, ownerToken } = started.data,
      p = `/music-proxy/runs/${run.id}`;
    assert.equal((await call(p + "/reveal", {}, ownerToken)).status, 409);
    assert.doesNotMatch(
      JSON.stringify(started.data),
      /"(?:mean|actual|segmentUsers|outcome)":/,
    );
    const freeze = await call(
      p + "/freeze",
      {
        beforeReveal: true,
        llm: {
          pick: "A",
          confidence: 60,
          source: "human — synthetic test fixture",
          answer: "Fixture selects A before reveal.",
        },
      },
      ownerToken,
    );
    assert.equal(freeze.status, 201);
    assert.match(freeze.data.freeze.sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      (await call(p + "/freeze", { beforeReveal: true }, ownerToken)).status,
      409,
    );
    assert.equal((await call(p + "/reveal", {}, "wrong")).status, 403);
    assert.doesNotMatch(
      JSON.stringify((await call(p)).data),
      /"(?:mean|actual|outcome)":/,
    );
    const revealed = await call(p + "/reveal", {}, ownerToken);
    assert.equal(revealed.status, 200);
    assert.equal(revealed.data.result.grades.llm, "✓");
    assert.equal(revealed.data.outcome.actual, "A");
    assert.equal((await call("/proxy/runs/" + run.id)).status, 404);
  }
  assert.equal((await call("/music-proxy")).data.tally.mock.cases, 40);
  assert.equal((await call("/proxy")).data.tally.mock.cases, 0);
  assert.equal((await call("/benchmark")).data.tally.closedCases, 0);
});
test("real music prediction resolves Music entities and requests direct candidate affinities without outcomes", async () => {
  const queries = [];
  const adapter = {
    searchEntities: async (name, type) => {
      assert.equal(type, "Music");
      return {
        results: {
          entities: [
            {
              entity_id: name,
              name,
              category: "Music",
              types: ["urn:entity:artist"],
              tags: [],
            },
          ],
        },
      };
    },
    getInsights: async (seeds, types, ids) => {
      queries.push({ seeds, types, ids });
      return {
        fetchedAt: "fixture",
        results: {
          entities: ids.map((id, i) => ({
            entity_id: id,
            query: { affinity: i ? 0.2 : 0.8 },
          })),
        },
      };
    },
  };
  const r = await predictMusic(catalog.cases[0], adapter, false);
  assert.equal(r.scoringVersion, "qloo-candidate-affinity-v1");
  assert.deepEqual(
    r.prediction.map((p) => p.score),
    [80, 20],
  );
  assert.deepEqual(queries[0].types, ["urn:entity:artist"]);
  assert.doesNotMatch(JSON.stringify(queries), /"(?:actual|mean|weight)":/);
});
