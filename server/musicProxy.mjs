import catalog from "./data/proxy-lastfm-cases.json" with { type: "json" };
import { createProxyApi, predictProxy } from "./proxy.mjs";
import { typeUrns } from "./fixtures.mjs";
const fail = (message) => {
  throw Object.assign(Error(message), { status: 400 });
};
export function validateMusicOutcomes(inputs, body) {
  if (
    body?.caseSetHash !== inputs.caseSetHash ||
    !Array.isArray(body.outcomes) ||
    body.outcomes.length !== inputs.cases.length
  )
    fail("Music outcome batch does not match catalog.");
  const ids = new Set(),
    rules = inputs.manifest.rules;
  for (const o of body.outcomes) {
    const c = inputs.cases.find((c) => c.id === o.id);
    if (!c || ids.has(o.id) || o.dataset !== c.dataset)
      fail("Unknown or duplicate music outcome.");
    ids.add(o.id);
    if (
      !Number.isInteger(o.segmentUsers) ||
      o.segmentUsers < rules.minUsers ||
      o.options?.length !== 2
    )
      fail("Invalid music segment.");
    for (let i = 0; i < 2; i++) {
      const v = o.options[i];
      if (
        v.artistId !== c.options[i].artistId ||
        !Number.isInteger(v.count) ||
        v.count < rules.minSegmentListeners ||
        v.count > o.segmentUsers ||
        !Number.isInteger(v.overallListeners) ||
        v.overallListeners < rules.minOverallListeners ||
        v.overallListeners < v.count ||
        !Number.isFinite(v.mean) ||
        v.mean <= 0
      )
        fail("Invalid music candidate listening counts.");
    }
    const [a, b] = o.options,
      gap = Math.abs(a.mean - b.mean) / Math.min(a.mean, b.mean);
    if (
      !Number.isFinite(o.relativeGap) ||
      gap + 1e-12 < rules.minRelativeGap ||
      Math.abs(gap - o.relativeGap) > 1e-9 ||
      o.actual !== (a.mean > b.mean ? "A" : "B")
    )
      fail("Invalid music winner/gap.");
  }
}
export async function predictMusic(input, adapter, mock) {
  const mapped = (a) => ({
    movieId: a.artistId,
    title: a.name,
    year: null,
    genres: [],
  });
  const result = await predictProxy(
    {
      ...input,
      seeds: input.seeds.map(mapped),
      options: input.options.map(mapped),
      audienceDefinition:
        "Historical users with all three seed artists in their own top 20% of observed listening weights (boundary ties included).",
    },
    adapter,
    mock,
    "music",
  );
  result.proxyDomain = "music";
  if (mock)
    result.seeds = result.seeds.map((s) => ({
      ...s,
      category: "Music",
      types: [typeUrns.Music],
    }));
  result.scoringNote = result.scoringNote
    .replaceAll("MovieLens", "Last.fm")
    .replaceAll("genre overlap", "artist-name fixture");
  result.provenance.mapping = result.provenance.mapping.replaceAll(
    "MovieLens rating",
    "Last.fm listening count",
  );
  if (mock) {
    result.scoringVersion = "proxy-music-mock-v1";
    result.provenance.source = "Synthetic artist-name fixtures";
    result.provenance.mapping =
      "Synthetic artist-name fixtures; workflow only.";
  }
  return result;
}
export function musicStore(store) {
  const key = (k) =>
    k
      .replace(/^proxy-/, "music-proxy-")
      .replace(/^freezes\//, "music-freezes/");
  return {
    get: (k) => store.get(key(k)),
    set: (k, v, o) => store.set(key(k), v, o),
    list: async (prefix) =>
      (await store.list(key(prefix))).map((k) =>
        k
          .replace(/^music-proxy-/, "proxy-")
          .replace(/^music-freezes\//, "freezes/"),
      ),
  };
}
export function createMusicProxyApi(store, options = {}) {
  const api = createProxyApi(musicStore(store), {
    catalogLoader: async () => catalog,
    predictor: predictMusic,
    validateOutcomes: validateMusicOutcomes,
    casePattern: "MX-\\d{3}",
    ...options,
  });
  return (request, pathname, readBody) =>
    pathname === "/api/music-proxy" || pathname.startsWith("/api/music-proxy/")
      ? api(
          request,
          pathname.replace("/api/music-proxy", "/api/proxy"),
          readBody,
        )
      : null;
}
