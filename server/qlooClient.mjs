import { typeUrns } from "./fixtures.mjs";

const fail = (message, status = 502) => {
  throw Object.assign(Error(message), { status });
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const list = (body) =>
  Array.isArray(body.results) ? body.results : body.results?.entities;
export function normalizeEntity(entity, type = "") {
  const id = entity.entity_id || entity.id;
  if (!uuid.test(id || "") || typeof entity.name !== "string")
    fail("Qloo returned an unsupported entity response.");
  const types = entity.types || [entity.type || type].filter(Boolean);
  const tags = (entity.tags || [])
    .filter((t) => typeof t.name === "string")
    .map((t) => ({
      name: t.name.toLowerCase(),
      tag_id: t.tag_id || t.id || t.value,
    }));
  const releaseYear = Number(
    entity.properties?.release_year ||
      String(entity.properties?.release_date || "").match(/^(\d{4})-/)?.[1],
  );
  const geo = entity.properties?.geocode || {};
  const location = [entity.properties?.address, geo.city, geo.country]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim().slice(0, 250));
  return {
    entity_id: id,
    name: entity.name,
    types,
    category:
      Object.keys(typeUrns).find((k) => types.includes(typeUrns[k])) ||
      "Film/TV",
    tags,
    ...(types.includes(typeUrns.Dining) && location.length
      ? { locationLabel: [...new Set(location)].join(" · ") }
      : {}),
    ...(Number.isInteger(releaseYear) &&
    releaseYear >= 1870 &&
    releaseYear <= 2200
      ? { releaseYear }
      : {}),
    ...(entity.query
      ? {
          query: {
            affinity: entity.query.affinity,
            explainability: entity.query.explainability,
          },
        }
      : {}),
  };
}
export function createQlooClient({
  key,
  baseUrl = "https://hackathon.api.qloo.com",
  fetchImpl = fetch,
} = {}) {
  const cache = new Map();
  const inflight = new Map();
  let queue = Promise.resolve(),
    lastRequest = 0,
    blockedUntil = 0;
  async function request(path, params) {
    if (!key) fail("Qloo real mode needs a server-side QLOO_API_KEY.", 503);
    const url = new URL(path, baseUrl);
    if (
      url.protocol !== "https:" ||
      !["hackathon.api.qloo.com", "api.qloo.com"].includes(url.hostname)
    )
      fail("Use an approved HTTPS Qloo API server.", 503);
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const cacheKey = url.href;
    const cached = cache.get(cacheKey);
    if (cached && cached.until > Date.now()) return cached.body;
    if (inflight.has(cacheKey)) return inflight.get(cacheKey);
    const promise = queue.then(async () => {
      if (Date.now() < blockedUntil)
        fail("Qloo rate limit reached. Please wait before retrying.", 429);
      const delay = Math.max(0, 650 - (Date.now() - lastRequest));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      lastRequest = Date.now();
      let response;
      try {
        response = await fetchImpl(url, {
          headers: { "X-Api-Key": key, accept: "application/json" },
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
      } catch {
        fail(
          "Qloo is unreachable or timed out. Try again; no mock fallback was used.",
          503,
        );
      }
      if (!response.ok) {
        if ([401, 403].includes(response.status))
          fail(
            "Qloo rejected the server credential. Check its validity and access scope.",
            503,
          );
        if (response.status === 429) {
          const retry = response.headers.get("retry-after");
          const seconds = Number(retry);
          const retryMs = !retry
            ? 30000
            : Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(retry) - Date.now();
          blockedUntil =
            Date.now() +
            Math.max(1000, Number.isFinite(retryMs) ? retryMs : 30000);
          fail("Qloo rate limit reached. Please wait before retrying.", 429);
        }
        if (response.status === 404 && path === "/search")
          return { results: [] };
        if (response.status === 400)
          fail(
            "Qloo could not process these entities or query. Refine your search or audience.",
            400,
          );
        fail("Qloo returned an upstream error. No mock fallback was used.");
      }
      let body;
      try {
        body = await response.json();
      } catch {
        fail("Qloo returned invalid JSON.");
      }
      if (body.success === false || !Array.isArray(list(body)))
        fail("Qloo returned an unsupported response.");
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      const captured = { ...body, _fetchedAt: new Date().toISOString() };
      cache.set(cacheKey, { until: Date.now() + 5 * 60000, body: captured });
      return captured;
    });
    queue = promise.catch(() => {});
    inflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      inflight.delete(cacheKey);
    }
  }
  return {
    async searchEntities(query = "", type = "") {
      if (!query.trim()) return { results: { entities: [] }, mode: "real" };
      const urn = typeUrns[type] || type;
      if (urn && !Object.values(typeUrns).includes(urn))
        fail("Choose a supported taste category.", 400);
      const body = await request("/search", {
        query: query.trim().slice(0, 100),
        types: urn,
        take: 12,
      });
      return {
        results: { entities: list(body).map((e) => normalizeEntity(e, urn)) },
        mode: "real",
      };
    },
    async resolveEntities(ids) {
      if (!ids.length || ids.some((id) => !uuid.test(id)))
        fail(
          "Real Qloo mode needs real entity IDs. Select your audience again.",
          400,
        );
      const body = await request("/entities", { entity_ids: ids.join(",") });
      const entities = list(body).map((e) => normalizeEntity(e));
      if (
        entities.length !== ids.length ||
        ids.some(
          (id) =>
            !entities.some(
              (e) => e.entity_id.toLowerCase() === id.toLowerCase(),
            ),
        )
      )
        fail(
          "A selected Qloo entity could not be resolved. Select it again.",
          400,
        );
      return entities;
    },
    async getInsights(ids, targetTypes = [typeUrns.Dining], candidateIds = []) {
      if (!ids.length || ids.some((id) => !uuid.test(id)))
        fail("Real Insights cannot use mock IDs.", 400);
      const types = [...new Set(targetTypes)];
      if (
        candidateIds.length &&
        (candidateIds.length > 2 || candidateIds.some((id) => !uuid.test(id)))
      )
        fail("Candidate affinity needs one or two real Qloo entity IDs.", 400);
      if (types.some((t) => !Object.values(typeUrns).includes(t)))
        fail("Unsupported Insights target type.", 400);
      // One supported type per request. Small result sets, bounded cache, no blind retries.
      const responses = await Promise.all(
        types.map((type) =>
          request("/v2/insights", {
            "filter.type": type,
            "signal.interests.entities": ids.join(","),
            "filter.results.entities": candidateIds.length
              ? candidateIds.join(",")
              : undefined,
            "feature.explainability": true,
            take: candidateIds.length || 5,
          }),
        ),
      );
      const entities = responses
        .flatMap((body, i) =>
          list(body).map((e) => {
            const normalized = normalizeEntity(e, types[i]);
            if (
              !Number.isFinite(normalized.query?.affinity) ||
              normalized.query.affinity < 0 ||
              normalized.query.affinity > 1
            )
              fail("Qloo returned an unsupported affinity value.");
            return normalized;
          }),
        )
        .sort((a, b) => b.query.affinity - a.query.affinity);
      return {
        results: { entities },
        mode: "real",
        fetchedAt: responses.map((b) => b._fetchedAt).sort()[0],
        targetTypes: types,
        ...(candidateIds.length
          ? { candidateIds, endpoint: "/v2/insights" }
          : {}),
      };
    },
  };
}
