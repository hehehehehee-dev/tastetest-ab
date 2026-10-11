import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateLastfmCases,
  parseLastfm,
  LASTFM_RULES,
} from "../scripts/build-proxy-lastfm-cases.mjs";
function fixture(userCount = 600) {
  const artists = Array.from({ length: 50 }, (_, i) => ({
    artistId: String(i + 1),
    name: `Fixture artist ${i + 1}`,
  }));
  const weights = [1000, 950, 900, 400, 200, ...Array(45).fill(10)];
  const listens = Array.from({ length: userCount }, (_, u) =>
    artists.map((a, i) => ({
      userId: String(u + 1),
      artistId: a.artistId,
      weight: weights[i],
    })),
  ).flat();
  return { artists, listens };
}
test("Last.fm deterministic fixture produces 40 distinct, blinded music inputs under all locked thresholds", () => {
  const f = fixture();
  const a = generateLastfmCases(f.artists, f.listens),
    b = generateLastfmCases(f.artists, [...f.listens].reverse());
  assert.deepEqual(a.inputs, b.inputs);
  assert.deepEqual(a.hidden, b.hidden);
  assert.equal(a.inputs.cases.length, 40);
  assert.equal(a.inputs.cases[0].id, "MX-001");
  assert.equal(a.inputs.cases[39].id, "MX-040");
  assert.equal(
    new Set(
      a.inputs.cases.map((c) =>
        JSON.stringify([
          c.seeds.map((s) => s.artistId).sort(),
          c.options.map((o) => o.artistId).sort(),
        ]),
      ),
    ).size,
    40,
  );
  assert.doesNotMatch(
    JSON.stringify(a.inputs.cases),
    /"(?:actual|weight|mean|segmentUsers|count|overallListeners|relativeGap)":/,
  );
  for (const c of a.inputs.cases) {
    assert.equal(c.seeds.length, 3);
    assert.ok(c.seeds.every((s) => Number(s.artistId) <= 5)); // Per-user top decile of 50 observed artists.
    assert.ok(
      c.options.every((o) => !c.seeds.some((s) => s.artistId === o.artistId)),
    );
  }
  for (const o of a.hidden.outcomes) {
    assert.ok(o.segmentUsers >= 30);
    assert.ok(o.relativeGap >= 0.2);
    assert.ok(
      o.options.every((v) => v.count >= 20 && v.overallListeners >= 500),
    );
    assert.equal(o.actual, o.options[0].mean > o.options[1].mean ? "A" : "B");
    // Means include all segment users, not only listeners of each artist.
    for (const candidate of o.options)
      assert.equal(
        candidate.mean,
        f.listens
          .filter((r) => r.artistId === candidate.artistId)
          .reduce((s, r) => s + r.weight, 0) / 600,
      );
  }
});
test("Last.fm fails with a complete audit rather than weakening eligibility or padding cases", () => {
  const f = fixture(26);
  assert.throws(
    () => generateLastfmCases(f.artists, f.listens),
    (error) => {
      assert.equal(error.audit.eligibleCases, 0);
      assert.equal(error.audit.maxTopDecileSegment, 26);
      assert.equal(error.audit.popularArtists.length, 0);
      assert.match(error.message, /No thresholds relaxed, no cases written/);
      return true;
    },
  );
  for (const override of [
    { minUsers: 29 },
    { minSegmentListeners: 19 },
    { minOverallListeners: 499 },
    { topFraction: 0.2 },
    { minRelativeGap: 0.19 },
  ])
    assert.throws(
      () =>
        generateLastfmCases(f.artists, f.listens, {
          rules: { ...LASTFM_RULES, ...override },
        }),
      /cannot relax/,
    );
});
test("Last.fm TSV parser retains names and rejects malformed/duplicate weights", () => {
  const parsed = parseLastfm(
    "id\tname\turl\tpictureURL\r\n1\tBjörk\thttps://example.com\t\r\n",
    "userID\tartistID\tweight\n1\t1\t123\n",
  );
  assert.equal(parsed.artists[0].name, "Björk");
  assert.equal(parsed.listens[0].weight, 123);
  assert.throws(() => parseLastfm("wrong", "wrong"), /header/);
  const f = fixture();
  assert.throws(
    () => generateLastfmCases(f.artists, [...f.listens, f.listens[0]]),
    /duplicate/,
  );
  assert.throws(
    () => generateLastfmCases(f.artists, [{ ...f.listens[0], weight: NaN }]),
    /Invalid/,
  );
});
