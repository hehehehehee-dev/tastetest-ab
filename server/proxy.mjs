import committedCatalog from "./data/proxy-cases.json" with { type: "json" };
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { makeFreeze, decisionTally } from "./benchmark.mjs";
import { qlooAdapter, isMockMode, mockQlooAdapter } from "./qlooAdapter.mjs";
import { typeUrns } from "./fixtures.mjs";
import {
  comparisonConfig,
  comparisonModels,
  configuredPredictor,
  proxyDefaultModel,
} from "./aiComparison.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const safeEqual = (a, b) =>
  timingSafeEqual(Buffer.from(hash(a || "")), Buffer.from(hash(b || "")));
export async function loadProxyCatalog() {
  return committedCatalog;
}
export function validateProxyOutcomes(catalog, body) {
  if (!catalog.manifest || !catalog.cases.length)
    fail("Generate the case set before seeding private outcomes.");
  if (
    body?.caseSetHash !== catalog.caseSetHash ||
    !Array.isArray(body.outcomes) ||
    body.outcomes.length !== catalog.cases.length
  )
    fail("Outcome batch does not match the committed case set.");
  const rules = catalog.manifest.rules;
  const ids = new Set();
  for (const result of body.outcomes) {
    const input = catalog.cases.find((c) => c.id === result.id);
    if (!input || ids.has(result.id) || result.dataset !== input.dataset)
      fail("Unknown or duplicate outcome.");
    ids.add(result.id);
    if (
      !Number.isInteger(result.segmentUsers) ||
      result.segmentUsers < rules.minUsers ||
      !Array.isArray(result.options) ||
      result.options.length !== 2
    )
      fail("Outcome fails audience-size rules.");
    for (let i = 0; i < 2; i++) {
      const value = result.options[i];
      if (
        String(value.movieId) !== String(input.options[i].movieId) ||
        !Number.isInteger(value.count) ||
        value.count < rules.minSegmentRatings ||
        value.count > result.segmentUsers ||
        !Number.isInteger(value.overallRatings) ||
        value.overallRatings < rules.minOverallRatings ||
        value.overallRatings < value.count ||
        !Number.isFinite(value.mean) ||
        value.mean < 0.5 ||
        value.mean > 5
      )
        fail("Outcome fails candidate-rating rules.");
    }
    const gap = Math.abs(result.options[0].mean - result.options[1].mean);
    const actual = result.options[0].mean > result.options[1].mean ? "A" : "B";
    if (
      gap + 1e-12 < rules.minGap ||
      Math.abs(gap - result.gap) > 1e-9 ||
      result.actual !== actual ||
      Math.max(...result.options.map((o) => o.overallRatings)) /
        Math.min(...result.options.map((o) => o.overallRatings)) >
        rules.maxPopularityRatio
    )
      fail("Outcome fails winner or popularity rules.");
  }
  return body;
}
export async function seedProxyOutcomes(
  store,
  catalog,
  body,
  validator = validateProxyOutcomes,
) {
  validator(catalog, body);
  const existing = await store.get(`proxy-outcomes/${catalog.caseSetHash}`);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(body))
      fail("Existing proxy outcomes are immutable.", 409);
    return false;
  }
  if (
    !(await store.set(`proxy-outcomes/${catalog.caseSetHash}`, body, {
      onlyIfNew: true,
    }))
  )
    fail("Outcomes were seeded concurrently; retry the same batch.", 409);
  return true;
}
export function scoreProxyFreeze(freeze, outcome) {
  return {
    actual: outcome.actual,
    grades: Object.fromEntries(
      Object.entries(freeze.payload.branches).map(([key, branch]) => [
        key,
        branch.pick == null
          ? "NOT RUN"
          : branch.pick === "TIE"
            ? "ABSTAIN"
            : branch.pick === outcome.actual
              ? "✓"
              : "✗",
      ]),
    ),
  };
}
export function proxyTally(rows) {
  const ordered = [...rows].sort(
    (a, b) => a.frozenAt.localeCompare(b.frozenAt) || a.id.localeCompare(b.id),
  );
  const counts = (mode) => {
    const seen = new Set();
    const cases = ordered.filter((row) => {
      if (row.mode !== mode || seen.has(row.caseId)) return false;
      seen.add(row.caseId);
      return true;
    });
    return {
      cases: cases.length,
      decisionCounts: decisionTally(cases),
      counts: Object.fromEntries(
        ["llm", "qloo", "agent"].map((key) => [
          key,
          {
            correct: cases.filter((row) => row.result.grades[key] === "✓")
              .length,
            total: cases.filter((row) => row.result.grades[key] !== "NOT RUN")
              .length,
          },
        ]),
      ),
    };
  };
  return {
    real: counts("real-qloo"),
    mock: counts("mock"),
    attempts: rows.length,
    methods: [
      ...new Set(rows.map((r) => r.scoringVersion || "concept-tag-fit-v2")),
    ],
    policy:
      "First completed prediction freeze per case and mode; all attempts retained. Retrospective proxy, never Track B.",
  };
}
const movieName = (movie) =>
  `${movie.title}${movie.year ? ` (${movie.year})` : ""}`;
function mockMovie(movie) {
  return {
    entity_id: `mock-proxy-${movie.movieId}`,
    name: movieName(movie),
    category: "Film/TV",
    types: [typeUrns["Film/TV"]],
    tags: movie.genres.map((name) => ({
      name: name.toLowerCase(),
      tag_id: `mock-genre-${name}`,
    })),
  };
}
function normalizedTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .replace(/, (the|a|an)$/i, "")
    .replace(/^(the|a|an) /i, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
// Verified catalog-year discrepancy; never relax year matching globally.
const filmYearExceptions = {
  1215: {
    title: "Army of Darkness",
    datasetYear: 1993,
    catalogYear: 1992,
    source: "https://www.universalpicturesathome.com/movies/army-of-darkness",
  },
};
export async function predictProxy(
  input,
  adapter = qlooAdapter,
  mock = isMockMode(),
  domain = "film",
) {
  const music = domain === "music";
  const entityType = music ? "Music" : "Film/TV";
  const resolutionNotes = [];
  async function resolve(movie) {
    if (mock) {
      const entity = mockMovie(movie);
      return music
        ? { ...entity, category: "Music", types: [typeUrns.Music] }
        : entity;
    }
    const exception = !music && filmYearExceptions[movie.movieId];
    const verifiedException =
      exception &&
      movie.title === exception.title &&
      movie.year === exception.datasetYear;
    const lookupYear = verifiedException ? exception.catalogYear : movie.year;
    const result = await adapter.searchEntities(
      movie.title.replace(/, (The|A|An)$/, ""),
      entityType,
    );
    const matches = result.results.entities.filter((entity) => {
      const year =
        entity.releaseYear || Number(entity.name.match(/\((\d{4})\)\s*$/)?.[1]);
      return (
        (music
          ? entity.name.normalize("NFC").toLowerCase() ===
            movie.title.normalize("NFC").toLowerCase()
          : normalizedTitle(entity.name) === normalizedTitle(movie.title)) &&
        (music || !year || year === lookupYear)
      );
    });
    const exactYear = matches.filter(
      (entity) =>
        entity.releaseYear === lookupYear ||
        entity.name.includes(`(${lookupYear})`),
    );
    const candidates = exactYear.length ? exactYear : matches;
    if (candidates.length !== 1)
      fail(
        `Cannot unambiguously resolve ${movieName(movie)} in Qloo. No prediction was invented.`,
        422,
      );
    if (verifiedException)
      resolutionNotes.push({
        movieId: movie.movieId,
        title: movie.title,
        datasetYear: movie.year,
        lookupYear,
        source: exception.source,
        note: "Verified catalog-year discrepancy; original dataset inputs unchanged.",
      });
    return candidates[0];
  }
  const seeds = await Promise.all(input.seeds.map(resolve)),
    candidates = await Promise.all(input.options.map(resolve));
  const insights = mock
    ? {
        mode: "mock",
        results: {
          entities: candidates.map((entity) => ({
            ...entity,
            query: {
              affinity: Math.min(
                0.95,
                0.1 +
                  (0.7 *
                    entity.tags.filter((tag) =>
                      seeds.some((seed) =>
                        seed.tags.some((t) => t.name === tag.name),
                      ),
                    ).length) /
                    Math.max(1, entity.tags.length),
              ),
            },
          })),
        },
      }
    : await adapter.getInsights(
        seeds.map((s) => s.entity_id),
        [typeUrns[entityType]],
        candidates.map((c) => c.entity_id),
      );
  const options = input.options.map((movie) => ({
    title: movieName(movie),
    description: music
      ? "Candidate artist for this historical music preference segment."
      : `${movie.genres.join(", ")} movie released in ${movie.year || "unknown year"}.`,
  }));
  const scoringAdapter = mock ? mockQlooAdapter : adapter;
  const prediction = mock
    ? await Promise.all(
        options.map((option) =>
          scoringAdapter.scoreOption(option, {
            seeds,
            insights,
            note: input.audienceDefinition,
          }),
        ),
      )
    : candidates.map((candidate) => {
        const result = insights.results.entities.find(
          (e) =>
            e.entity_id.toLowerCase() === candidate.entity_id.toLowerCase(),
        );
        if (
          !result ||
          !Number.isFinite(result.query?.affinity) ||
          result.query.affinity < 0 ||
          result.query.affinity > 1
        )
          fail(
            `Qloo did not return a valid affinity for ${candidate.name}. No substitute score was used.`,
            422,
          );
        return {
          score: result.query.affinity * 100,
          components: {
            baseline: 0,
            affinity: result.query.affinity * 100,
            tagOverlap: 0,
            segmentWarning: 0,
            affinitySum: result.query.affinity,
          },
          matchedTags: [],
          reasons: [
            "Score = 100 × this candidate's Qloo affinity to the three seed entities. No keyword/tag mapping.",
          ],
          warning: null,
        };
      });
  return {
    seeds,
    options,
    prediction,
    mode: mock ? "mock" : "real",
    scoringVersion: mock ? "proxy-genre-mock-v1" : "qloo-candidate-affinity-v1",
    proxyDecisionPolicy: "always-pick-v1",
    provenance: {
      source: mock ? "Synthetic genre fixtures" : "Qloo API",
      endpoint: mock ? null : "/v2/insights",
      fetchedAt: mock ? null : insights.fetchedAt,
      ...(resolutionNotes.length ? { resolutionNotes } : {}),
      seedEntityIds: seeds.map((s) => s.entity_id),
      candidateEntityIds: candidates.map((c) => c.entity_id),
      affinities: mock
        ? []
        : candidates.map((c) => {
            const e = insights.results.entities.find(
              (e) => e.entity_id.toLowerCase() === c.entity_id.toLowerCase(),
            );
            return {
              entityId: c.entity_id,
              name: c.name,
              affinity: e.query.affinity,
              explainability: e.query.explainability || null,
            };
          }),
      mapping: mock
        ? "Synthetic genre overlap workflow only"
        : "fit score = 100 × candidate affinity; higher score always wins, exact ties choose A. Gaps <10 are labeled low separation. Affinity is not a probability of votes or a MovieLens rating.",
    },
    audienceNote: input.audienceDefinition,
    benchmarkMetadata: { track: "rehearsal", caseLabel: input.id },
    scoringNote: mock
      ? "Synthetic genre overlap; Qloo and Agent share one mock predictor. MovieLens outcomes are never supplied."
      : "Qloo and Agent use the same direct candidate affinity, not independent predictors. Higher score always wins; exact ties choose A. Gaps <10 are low separation, not an abstention. MovieLens outcomes are never supplied to Qloo. Confidence is not calibrated.",
  };
}
export function createProxyApi(
  store,
  {
    adapter = qlooAdapter,
    catalogLoader = loadProxyCatalog,
    mockMode = isMockMode,
    adminToken = () => process.env.PROXY_ADMIN_TOKEN,
    predictor = predictProxy,
    validateOutcomes = validateProxyOutcomes,
    casePattern = "PX-\\d{3}",
    aiEnabled = false,
    aiPredictor,
  } = {},
) {
  const aiInFlight = new Set();
  const owns = (run, request) =>
    safeEqual(run.ownerHash, hash(request.headers.get("x-owner-token") || ""));
  async function snapshot(run, owner = false) {
    const freeze = await store.get(`freezes/${run.id}`),
      result = await store.get(`proxy-results/${run.id}`);
    const { ownerHash, ...safe } = run;
    if (!owner) {
      delete safe.prediction;
      delete safe.provenance;
      safe.seeds = safe.seeds.map(({ entity_id, name, category }) => ({
        entity_id,
        name,
        category,
      }));
    }
    return {
      ...safe,
      lifecycle: result ? "revealed" : freeze ? "predictions frozen" : "draft",
      frozenAt: freeze?.payload.frozenAt || null,
      ...(owner && freeze ? { freeze } : {}),
      ...(owner
        ? { llmPrediction: await store.get(`proxy-ai/${run.id}`) }
        : {}),
      ...(owner && result
        ? {
            result: result.result,
            outcome: result.outcome,
            revealedAt: result.revealedAt,
          }
        : {}),
    };
  }
  return async (request, pathname, readBody) => {
    if (!pathname.startsWith("/api/proxy")) return null;
    const catalog = await catalogLoader();
    if (pathname === "/api/proxy/admin/seed" && request.method === "POST") {
      const token = adminToken();
      if (
        !token ||
        token.length < 32 ||
        !safeEqual(request.headers.get("x-proxy-admin-token"), token)
      )
        fail(
          "Proxy outcome seeding requires the server's admin credential.",
          403,
        );
      const body = await readBody(request);
      const created = await seedProxyOutcomes(
        store,
        catalog,
        body,
        validateOutcomes,
      );
      return {
        data: { seeded: catalog.cases.length, created },
        status: created ? 201 : 200,
      };
    }
    if (pathname === "/api/proxy" && request.method === "GET") {
      const rows = (
        await Promise.all(
          (await store.list("proxy-results/")).map((k) => store.get(k)),
        )
      ).filter((row) => row?.caseSetHash === catalog.caseSetHash);
      return {
        data: {
          ...catalog,
          ai: {
            ...comparisonConfig(),
            model: proxyDefaultModel(),
            enabled: aiEnabled,
            models: comparisonModels(),
          },
          available: !!(await store.get(
            `proxy-outcomes/${catalog.caseSetHash}`,
          )),
          tally: proxyTally(rows),
        },
      };
    }
    const start = pathname.match(
      new RegExp(`^/api/proxy/cases/(${casePattern})/start$`),
    );
    if (start && request.method === "POST") {
      const input = catalog.cases.find((c) => c.id === start[1]);
      if (!input) fail("Proxy case not found.", 404);
      if (!(await store.get(`proxy-outcomes/${catalog.caseSetHash}`)))
        fail(
          "Private outcomes have not been seeded by the administrator.",
          503,
        );
      const ownerToken = randomBytes(32).toString("hex");
      const run = {
        ...(await predictor(input, adapter, mockMode())),
        id: randomUUID(),
        proxyCaseId: input.id,
        caseSetHash: catalog.caseSetHash,
        input,
        createdAt: new Date().toISOString(),
        ownerHash: hash(ownerToken),
      };
      await store.set(`proxy-runs/${run.id}`, run, { onlyIfNew: true });
      return {
        data: { run: await snapshot(run, true), ownerToken },
        status: 201,
      };
    }
    const match = pathname.match(
      /^\/api\/proxy\/runs\/([a-f0-9-]{36})(?:\/(freeze|reveal|ai))?$/,
    );
    if (!match) fail("Proxy route not found.", 404);
    const [, id, action] = match,
      run = await store.get(`proxy-runs/${id}`);
    if (!run) fail("Proxy run not found.", 404);
    if (!action && request.method === "GET")
      return { data: await snapshot(run, owns(run, request)) };
    if (!owns(run, request))
      fail(
        "Only the creating browser can freeze or reveal this proxy run.",
        403,
      );
    if (action === "ai" && request.method === "POST") {
      if (!aiEnabled)
        fail(
          "Automatic AI is enabled for local testing only; use manual entry on this server.",
          403,
        );
      if (await store.get(`freezes/${id}`))
        fail("Frozen predictions cannot be edited.", 409);
      const body = await readBody(request);
      const recorded = await store.get(`proxy-ai/${id}`);
      if (recorded) {
        if (
          body.model &&
          body.model !==
            (recorded.requestedModel || recorded.source.split(":")[0])
        )
          fail(
            "This run already has a recorded AI prediction. Start a new run for a new immutable prediction.",
            409,
          );
        return { data: await snapshot(run, true) };
      }
      if (aiInFlight.has(id))
        fail("An AI prediction is already running for this case.", 409);
      aiInFlight.add(id);
      try {
        // Blind context: no Qloo scores, entity affinities or hidden dataset outcomes.
        const context = {
          options: run.options.map(({ title, description }, i) => ({
            label: i ? "B" : "A",
            title,
            description,
          })),
          audience: {
            tastes: run.input.seeds.map((seed) => seed.title || seed.name),
            note: run.input.audienceDefinition,
          },
        };
        const prediction = await (
          aiPredictor || configuredPredictor(body.model || proxyDefaultModel())
        )(context);
        if (
          !["A", "B", "TIE"].includes(prediction.choice) ||
          !Number.isInteger(prediction.confidence) ||
          prediction.confidence < 0 ||
          prediction.confidence > 100 ||
          !prediction.model
        )
          fail("AI returned an invalid prediction.", 502);
        if (await store.get(`freezes/${id}`))
          fail(
            "This case was frozen while AI was running; the prediction was not recorded.",
            409,
          );
        await store.set(
          `proxy-ai/${id}`,
          {
            pick: prediction.choice,
            confidence: prediction.confidence,
            source: prediction.model,
            answer:
              prediction.rationale ||
              `Pick: ${prediction.choice}; confidence: ${prediction.confidence}. No explanation recorded.`,
            method: "automatic blind API",
            provider: prediction.provider,
            responseId: prediction.responseId,
            requestedModel:
              prediction.requestedModel ||
              body.model ||
              comparisonConfig().model,
            recordedAt: prediction.finishedAt || new Date().toISOString(),
          },
          { onlyIfNew: true },
        );
        return { data: await snapshot(run, true) };
      } finally {
        aiInFlight.delete(id);
      }
    }
    if (action === "freeze") {
      if (await store.get(`freezes/${id}`))
        fail("Frozen predictions cannot be edited.", 409);
      if (request.method !== "POST") fail("This action is not supported.", 405);
      const body = await readBody(request);
      if (aiInFlight.has(id))
        fail("Wait for the AI prediction before freezing.", 409);
      if (body.mode === "manual")
        fail(
          "Proxy Qloo/Agent picks must come from the adapter, not manual overrides.",
        );
      const automated =
        body.llmMode === "automatic" ? await store.get(`proxy-ai/${id}`) : null;
      if (body.llmMode === "automatic" && !automated)
        fail("Run AI before freezing its prediction.");
      const manual = body.llm;
      if (body.visitorPick != null && !["A", "B"].includes(body.visitorPick))
        fail("Visitor pick must be A or B, or skipped.");
      if (body.llmMode === "skip" && (await store.get(`proxy-ai/${id}`)))
        fail("An AI response is already recorded; use it instead of skipping.");
      const llm = automated || {
        ...manual,
        answer:
          manual?.answer?.trim() ||
          `Pick: ${manual?.pick}; confidence: ${manual?.confidence}. No explanation recorded.`,
      };
      const freeze = makeFreeze(
        {
          ...run,
          proxyLlmPrediction: automated,
          proxySkipLlm: body.llmMode === "skip",
          proxyVisitorPick: body.visitorPick ?? null,
        },
        {
          ...body,
          llm,
          metadata: run.benchmarkMetadata,
        },
      );
      if (!(await store.set(`freezes/${id}`, freeze, { onlyIfNew: true })))
        fail("Frozen predictions cannot be edited.", 409);
      return { data: await snapshot(run, true), status: 201 };
    }
    if (action === "reveal" && request.method === "POST") {
      const freeze = await store.get(`freezes/${id}`);
      if (!freeze)
        fail("Freeze predictions before revealing the proxy outcome.", 409);
      const batch = await store.get(`proxy-outcomes/${run.caseSetHash}`),
        outcome = batch?.outcomes.find((o) => o.id === run.proxyCaseId);
      if (!outcome) fail("Private outcome unavailable.", 503);
      const row = {
        id,
        caseId: run.proxyCaseId,
        caseSetHash: run.caseSetHash,
        scoringVersion: run.scoringVersion || "concept-tag-fit-v2",
        mode: freeze.payload.mode,
        frozenAt: freeze.payload.frozenAt,
        revealedAt: new Date().toISOString(),
        branches: Object.fromEntries(
          Object.entries(freeze.payload.branches).map(([key, b]) => [
            key,
            { pick: b.pick, confidence: b.confidence, source: b.source },
          ]),
        ),
        outcome,
        result: scoreProxyFreeze(freeze, outcome),
      };
      await store.set(`proxy-results/${id}`, row, { onlyIfNew: true });
      return { data: await snapshot(run, true) };
    }
    fail("This action is not supported.", 405);
  };
}
