import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  qlooAdapter,
  mockQlooAdapter,
  isMockMode,
  scoreWithoutQloo,
} from "./qlooAdapter.mjs";
import { sampleInput, typeUrns } from "./fixtures.mjs";
import { predictionConfidence } from "../shared/confidence.mjs";
import { cookieCats, makeCookieCommit } from "./cookieCats.mjs";
import {
  validateMetadata,
  makeFreeze,
  scoreFreeze,
  benchmarkTally,
} from "./benchmark.mjs";
import {
  configuredVerdictChatResponder,
  createComparison,
  scoreComparison,
} from "./aiComparison.mjs";
import { createProxyApi } from "./proxy.mjs";
import { createMusicProxyApi } from "./musicProxy.mjs";
import { createVerdictChat, trackBChatContext } from "./verdictChat.mjs";
import {
  pendingTrackB,
  excludedTrackBNotes,
  ledgerCsv,
} from "./benchmarkLedger.mjs";
import {
  beginPredictionStep,
  clonePredictionWork,
  completePredictionWork,
  createPredictionWork,
  failPredictionStep,
  finishPredictionStep,
  runPredictionStep,
} from "../shared/predictionWork.mjs";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function predict(input, adapter = qlooAdapter, aiPredictor) {
  const direct = input.comparisonKind === "entities";
  const work = createPredictionWork({
    mode: isMockMode() ? "mock" : "real",
    context: input.creationMode === "quick" ? "quick-test" : "track-b",
  });
  const seeds = await runPredictionStep(
    work,
    "resolve-seeds",
    () => adapter.resolveEntities(input.seedEntityIds),
    (value) =>
      `${value.length} of ${input.seedEntityIds.length} seeds resolved.`,
    "Couldn't resolve the taste seeds in Qloo. No prediction was recorded.",
  );
  const candidates = await runPredictionStep(
    work,
    "resolve-candidates",
    async () => {
      if (!direct) return [];
      const resolved = await adapter.resolveEntities(
        input.options.map((o) => o.entityId),
      );
      return input.options.map((option) => {
        const entity = resolved.find(
          (e) => e.entity_id.toLowerCase() === option.entityId.toLowerCase(),
        );
        if (!entity || !entity.types?.includes(input.insightType))
          fail(
            "A confirmed option does not match the selected Qloo category. Select it again.",
          );
        return entity;
      });
    },
    (value) =>
      direct
        ? `${value.length} of 2 confirmed option entities resolved.`
        : "Custom ideas remain text inputs; direct entity affinity is unavailable.",
    "Couldn't prepare the two candidate concepts. No prediction was recorded.",
  );
  const resolvedCandidateCount = candidates.length;
  const options = direct
    ? input.options.map((option, index) => ({
        ...option,
        title: candidates[index].name,
      }))
    : input.options;
  let tasteProfile;
  const insights = await runPredictionStep(
    work,
    "fetch-affinities",
    async () => {
      const result = await adapter.getInsights(
        input.seedEntityIds,
        [input.insightType || typeUrns.Dining],
        direct ? candidates.map((e) => e.entity_id) : [],
      );
      if (
        direct &&
        (result.mode !== "real" ||
          candidates.some((candidate) => {
            const signal = result.results.entities.find(
              (e) =>
                e.entity_id.toLowerCase() === candidate.entity_id.toLowerCase(),
            );
            return (
              !Number.isFinite(signal?.query?.affinity) ||
              signal.query.affinity < 0 ||
              signal.query.affinity > 1
            );
          }))
      )
        fail(
          "Qloo did not return real affinity for both confirmed options. No text score was substituted.",
          502,
        );
      if (
        input.compareAi &&
        result.mode === "real" &&
        typeof adapter.getTasteProfile === "function"
      ) {
        try {
          tasteProfile = await adapter.getTasteProfile(
            input.seedEntityIds,
            input.insightType,
          );
          if (tasteProfile?.mode !== "real")
            throw Error("No real profile returned");
        } catch {
          tasteProfile = {
            mode: "real",
            status: "unavailable",
            tags: [],
            note: "Taste Analysis was unavailable. Only the successfully recorded Qloo signals are used.",
          };
        }
      }
      return result;
    },
    (value) =>
      (direct
        ? "2 direct candidate affinities returned from the combined-seed query."
        : `${value.results.entities.length} audience affinity signals returned from one combined-seed query.`) +
      (tasteProfile
        ? tasteProfile.status === "available"
          ? ` Taste Analysis returned ${tasteProfile.tags.length} context tags.`
          : " Taste Analysis returned no usable profile; no profile tags were substituted."
        : ""),
    "Couldn't reach Qloo for audience affinity signals. No prediction was recorded.",
  );
  work.mode = insights.mode || work.mode;
  const profile = { seeds, insights, note: input.audienceNote };
  const scored = await runPredictionStep(
    work,
    "score-fit",
    async () => ({
      prediction: direct
        ? candidates.map((candidate) => {
            const signal = insights.results.entities.find(
              (e) =>
                e.entity_id.toLowerCase() === candidate.entity_id.toLowerCase(),
            );
            const affinity = signal.query.affinity;
            return {
              score: affinity * 100,
              components: {
                baseline: 0,
                affinity: affinity * 100,
                tagOverlap: 0,
                segmentWarning: 0,
                affinitySum: affinity,
              },
              matchedTags: [],
              reasons: [
                `Score = 100 × ${candidate.name}'s Qloo affinity to the selected audience tastes. This is not a vote probability.`,
              ],
              warning: null,
            };
          })
        : await Promise.all(
            input.options.map((o) => adapter.scoreOption(o, profile)),
          ),
      baseline: options.map((o) =>
        scoreWithoutQloo(o, seeds, input.audienceNote),
      ),
    }),
    (value) =>
      direct
        ? "Both confirmed options scored directly from Qloo affinity; no text heuristic was used."
        : resolvedCandidateCount < 2 ||
            value.prediction.every(
              (result) => !(result.components?.affinitySum > 0),
            )
          ? "Fell back to text heuristic — no Qloo entity signal"
          : "Two text concepts scored with Qloo affinity contributions and the declared concept-tag fit heuristic.",
    "Couldn't score audience fit. No prediction was recorded.",
  );
  const qlooFallback =
    !direct &&
    (resolvedCandidateCount < 2 ||
      scored.prediction.every(
        (result) => !(result.components?.affinitySum > 0),
      ));
  let comparison;
  if (input.compareAi) {
    beginPredictionStep(work, "record-branches");
    comparison = await createComparison(
      { ...input, options },
      seeds,
      insights,
      aiPredictor,
      scored.prediction,
      qlooFallback,
      direct ? "direct-entity-affinity" : "custom-concept-fit",
      tasteProfile,
    );
    finishPredictionStep(
      work,
      "record-branches",
      direct
        ? "AI-only, direct Qloo affinity and combined Agent predictions recorded."
        : "AI-only, Qloo fallback and combined Agent predictions recorded.",
    );
    beginPredictionStep(work, "freeze");
    finishPredictionStep(
      work,
      "freeze",
      `Frozen at ${comparison.payload.committedAt} · SHA-256 ${comparison.sha256.slice(0, 12)}.`,
    );
    completePredictionWork(work, {
      payload: { frozenAt: comparison.payload.committedAt },
      sha256: comparison.sha256,
    });
  }
  return {
    ...(direct
      ? { options, title: `${options[0].title} vs. ${options[1].title}` }
      : {}),
    seeds,
    ...(comparison ? { comparison } : {}),
    prediction: scored.prediction,
    baseline: scored.baseline,
    insights: insights.results.entities
      .slice(0, 3)
      .map((e) => ({ name: e.name, affinity: e.query.affinity })),
    mode: insights.mode,
    scoringVersion: direct
      ? "qloo-candidate-affinity-v1"
      : "concept-tag-fit-v2",
    provenance: {
      source: insights.mode === "real" ? "Qloo API" : "Synthetic fixtures",
      fetchedAt: insights.fetchedAt || null,
      targetTypes: insights.targetTypes || [],
      mapping:
        "Local concept/tag overlap heuristic; Qloo affinity is not a prediction of votes.",
      resolvedCandidateCount,
      qlooOptionSignal: direct,
      qlooFallback,
      ...(direct
        ? {
            candidateEntityIds: candidates.map((e) => e.entity_id),
            mapping:
              "fit score = 100 × confirmed candidate Qloo affinity; not a vote probability.",
          }
        : {}),
      fallbackLabel: qlooFallback
        ? "Qloo: no data for these options — heuristic fallback"
        : null,
    },
    predictionWork: work,
  };
}
function validateInput(body) {
  if (!body || !Array.isArray(body.options) || body.options.length !== 2)
    fail("Please provide two options.");
  const creationMode =
    body.creationMode === "quick" || body.compareAi === true
      ? "quick"
      : "evidence";
  const comparisonKind = body.comparisonKind || "concepts";
  if (!["concepts", "entities"].includes(comparisonKind))
    fail("Choose custom ideas or confirmed Qloo entities.");
  if (comparisonKind === "entities" && creationMode !== "quick")
    fail("Direct entity comparison is available in Quick test only.");
  if (comparisonKind === "entities" && body.compareAi !== true)
    fail("Direct entity comparison requires automatic branch predictions.");
  const options = body.options.map((o, index) => {
    if (
      !o ||
      typeof o.title !== "string" ||
      !o.title.trim() ||
      o.title.length > 100
    )
      fail(`Option ${index ? "B" : "A"} needs a title of 1–100 characters.`);
    if (
      typeof o.description !== "string" ||
      !o.description.trim() ||
      o.description.length > 1200
    )
      fail(
        `Option ${index ? "B" : "A"} needs a description of 1–1,200 characters.`,
      );
    const imageUrl = typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
    if (
      imageUrl &&
      !["/posters/slow-mornings.svg", "/posters/weekend.svg"].includes(imageUrl)
    ) {
      try {
        const url = new URL(imageUrl);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          imageUrl.length > 2000
        )
          throw Error();
      } catch {
        fail("Image links must start with https:// or http://.");
      }
    }
    return {
      title: o.title.trim(),
      description: o.description.trim(),
      imageUrl,
      ...(comparisonKind === "entities"
        ? {
            entityId:
              typeof o.entityId === "string" &&
              /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
                o.entityId,
              )
                ? o.entityId.toLowerCase()
                : fail(
                    `Confirm a Qloo entity for Option ${index ? "B" : "A"}.`,
                  ),
          }
        : {}),
    };
  });
  if (
    !Array.isArray(body.seedEntityIds) ||
    body.seedEntityIds.length < 3 ||
    body.seedEntityIds.length > 5 ||
    body.seedEntityIds.some((id) => typeof id !== "string") ||
    new Set(body.seedEntityIds).size !== body.seedEntityIds.length
  )
    fail("Choose 3–5 different taste seeds.");
  if (
    comparisonKind === "entities" &&
    (options[0].entityId === options[1].entityId ||
      options.some((option) =>
        body.seedEntityIds.some((id) => id.toLowerCase() === option.entityId),
      ))
  )
    fail(
      "Choose two different options, separate from the audience taste seeds.",
    );
  if (
    body.audienceNote != null &&
    (typeof body.audienceNote !== "string" || body.audienceNote.length > 300)
  )
    fail("Keep the audience note under 300 characters.");
  const benchmarkMetadata = validateMetadata(body.benchmarkMetadata);
  return {
    options,
    seedEntityIds: body.seedEntityIds,
    audienceNote: (body.audienceNote || "").trim(),
    title: `${options[0].title} vs. ${options[1].title}`,
    insightType:
      typeUrns[body.insightCategory || "Dining"] ||
      fail("Select a supported recommendation context."),
    compareAi: body.compareAi === true,
    comparisonKind,
    creationMode,
    benchmarkMetadata:
      creationMode === "quick"
        ? {
            ...benchmarkMetadata,
            track: "rehearsal",
            unpublished: false,
            audienceVerified: false,
          }
        : benchmarkMetadata,
  };
}
function verdict(test, counts) {
  const total = counts[0] + counts[1];
  const actual =
    !total || counts[0] === counts[1] ? null : counts[0] > counts[1] ? 0 : 1;
  const predicted = test.comparison
    ? ({ A: 0, B: 1 }[test.comparison.payload.aiQloo.choice] ?? null)
    : test.freeze
      ? ({ A: 0, B: 1 }[test.freeze.payload.branches.agent.pick] ?? null)
      : predictionConfidence(test.prediction).tooClose
        ? null
        : test.prediction[0].score > test.prediction[1].score
          ? 0
          : 1;
  const share =
    actual === null ? null : Math.round((counts[actual] / total) * 100);
  const recommendation = !total
    ? "No votes were collected, so there is no audience verdict yet. The mock prediction is only a hypothesis. Run a fresh poll and collect responses before making a business decision."
    : actual === null
      ? `The poll is tied at ${counts[0]} votes per option. Neither concept has a clear audience lead. Ask voters what influenced their choice, refine the two concepts, and run another test.`
      : `${test.options[actual].title} received ${share}% of ${total} votes. ${predicted === null ? "The mock prediction was too close to call, so the poll provides the first clear direction." : actual === predicted ? "The audience result supports the mock cultural prediction." : "The audience chose differently from the mock cultural prediction; favor the observed preference."} Use this option for a small trial, then measure real outcomes. This is a convenience poll, not a representative study.`;
  return {
    actual,
    predicted,
    share,
    ...(test.comparison
      ? { paired: scoreComparison(test.comparison, counts, true) }
      : {}),
    recommendation: test.freeze
      ? `${total ? `${total} anonymous browser votes.` : "No votes were collected."} ${total < 20 ? "Indicative only: fewer than 20 votes; excluded from the benchmark tally." : "Compare the three frozen choices with the observed winner in the receipt."} ${actual === null ? "No winner can be scored from a tied or empty poll." : "One case does not establish predictor superiority."} Convenience poll; confidence is not calibrated.`
      : test.comparison
        ? `${total} anonymous browser votes were collected. ${scoreComparison(test.comparison, counts, true).status === "EVALUABLE" ? "Compare both locked AI choices with the audience result below. One case cannot establish that Qloo improves accuracy." : "This case cannot be scored as a winner comparison: collect at least 10 votes in a fresh poll and require a non-tied result."} This convenience poll is not a representative study.`
        : test.mode === "real"
          ? recommendation
              .replaceAll(
                "mock cultural prediction",
                "Qloo-grounded concept-fit hypothesis",
              )
              .replaceAll("mock prediction", "Qloo-grounded hypothesis")
          : recommendation,
  };
}
export function createApi(
  store,
  {
    adapter = qlooAdapter,
    aiPredictor,
    chatResponder,
    proxyOptions = {},
    musicOptions = {},
  } = {},
) {
  const answerChat =
    chatResponder || ((input) => configuredVerdictChatResponder()(input));
  const verdictChat = createVerdictChat({ store, responder: answerChat });
  const proxyApi = createProxyApi(store, {
    adapter,
    chatResponder: answerChat,
    ...proxyOptions,
  });
  const musicApi = createMusicProxyApi(store, {
    adapter,
    chatResponder: answerChat,
    ...musicOptions,
  });
  const owns = (test, request) =>
    !!test.ownerHash &&
    timingSafeEqual(
      Buffer.from(hash(request.headers.get("x-owner-token") || "")),
      Buffer.from(test.ownerHash),
    );
  async function snapshot(test, allowPredictions = false) {
    if (!test.isSample)
      test = {
        ...test,
        closedAt: (await store.get(`closed/${test.id}`))?.at || null,
      };
    const counts = test.sampleVotes ? [...test.sampleVotes] : [0, 0];
    if (!test.sampleVotes) {
      const votes = await Promise.all(
        (await store.list(`votes/${test.id}/`)).map((k) => store.get(k)),
      );
      for (const vote of votes)
        if (vote && (!test.closedAt || vote.at <= test.closedAt))
          counts[vote.option]++;
    }
    // Once appended, the benchmark outcome is as immutable as its freeze.
    const recordedResult = test.closedAt
      ? await store.get(`benchmark-results/${test.id}`)
      : null;
    if (recordedResult) counts.splice(0, 2, ...recordedResult.result.votes);
    const { ownerHash, ...publicTest } = test;
    // Add display assets to an existing live demo without changing its frozen data.
    if (test.isLiveSample)
      publicTest.options = test.options.map((o, i) => ({
        ...o,
        imageUrl:
          o.imageUrl ||
          (o.title === sampleInput.options[i].title
            ? sampleInput.options[i].imageUrl
            : ""),
      }));
    const freeze = await store.get(`freezes/${test.id}`);
    const recordedWork = await store.get(`prediction-work/${test.id}`);
    if (recordedWork) publicTest.predictionWork = recordedWork;
    const opened = await store.get(`opened/${test.id}`);
    if (
      (test.comparison || test.freezeRequired) &&
      !test.closedAt &&
      !allowPredictions
    ) {
      delete publicTest.comparison;
      delete publicTest.prediction;
      delete publicTest.baseline;
      delete publicTest.insights;
      delete publicTest.provenance;
      delete publicTest.predictionWork;
      publicTest.seeds = test.seeds.map(({ entity_id, name, category }) => ({
        entity_id,
        name,
        category,
      }));
    }
    return {
      ...publicTest,
      pollOpenedAt: opened?.at || null,
      lifecycle: test.closedAt
        ? "closed"
        : opened
          ? "collecting"
          : freeze
            ? "predictions frozen"
            : "draft",
      frozenAt: freeze?.payload.frozenAt || null,
      ...((allowPredictions || test.closedAt) && freeze ? { freeze } : {}),
      benchmarkResult:
        recordedResult?.result ||
        (test.closedAt && freeze ? scoreFreeze(freeze, counts) : null),
      votes: counts,
      totalVotes: counts[0] + counts[1],
      verdict: test.closedAt ? verdict({ ...test, freeze }, counts) : null,
      mode: test.mode || "mock",
      confidence: test.comparison
        ? null
        : predictionConfidence(test.prediction),
      ...(test.comparison
        ? {
            isPairedComparison: true,
            commitment: {
              sha256: test.comparison.sha256,
              committedAt: test.comparison.payload.committedAt,
            },
            pollOpenedAt: (await store.get(`opened/${test.id}`))?.at || null,
          }
        : {}),
    };
  }
  async function readBody(request) {
    const raw = await request.text();
    if (raw.length > 100000) fail("This request is too large.", 413);
    try {
      return JSON.parse(raw);
    } catch {
      fail("Please send a valid JSON request.");
    }
  }
  return async (request) => {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/$/, "");
      const proxyResponse =
        (await musicApi(request, pathname, readBody)) ||
        (await proxyApi(request, pathname, readBody));
      if (proxyResponse)
        return json(proxyResponse.data, proxyResponse.status || 200);
      if (pathname === "/api/config" && request.method === "GET")
        return json({
          mode: isMockMode() ? "mock" : "real",
          configured: isMockMode() || !!process.env.QLOO_API_KEY,
          ai: {
            configured: false,
            provider: "manual",
            label: "AI-only (external)",
          },
        });
      if (
        ["/api/benchmark", "/api/benchmark/export.csv"].includes(pathname) &&
        request.method === "GET"
      ) {
        const rows = (
          await Promise.all(
            (await store.list("benchmark-results/")).map((key) =>
              store.get(key),
            ),
          )
        ).filter(Boolean);
        const enriched = await Promise.all(
          rows.map(async (row) => {
            const freeze = await store.get(`freezes/${row.id}`);
            const p = freeze?.payload;
            return {
              ...row,
              context: p
                ? [p.metadata.business, p.metadata.decision]
                    .filter(Boolean)
                    .join(" · ")
                : "",
              seeds: p?.audience.seeds || [],
              originalRecordedAt: p?.originalRecordedAt || null,
            };
          }),
        );
        const openCases = (
          await Promise.all(
            (await store.list("tests/")).map(async (key) => {
              const test = await store.get(key);
              if (!test || (await store.get(`closed/${test.id}`))) return null;
              const freeze = await store.get(`freezes/${test.id}`);
              const metadata =
                freeze?.payload.metadata || test.benchmarkMetadata;
              if (metadata?.track !== "track-b") return null;
              return {
                id: test.id,
                caseLabel:
                  freeze?.payload.caseLabel || metadata.caseLabel || test.title,
                context: [metadata.business, metadata.decision]
                  .filter(Boolean)
                  .join(" · "),
                seeds: test.seeds.map(({ name }) => ({ name })),
                frozenAt: freeze?.payload.frozenAt || null,
                originalRecordedAt: freeze?.payload.originalRecordedAt || null,
                status: freeze
                  ? "predictions frozen / awaiting outcome"
                  : "draft — predictions not frozen",
              };
            }),
          )
        ).filter(Boolean);
        const pending = pendingTrackB.filter(
          (p) =>
            ![...enriched, ...openCases].some(
              (r) => r.caseLabel === p.caseLabel,
            ),
        );
        const data = {
          rows: enriched,
          openCases,
          pending,
          excludedNotes: excludedTrackBNotes,
          tally: benchmarkTally(rows),
        };
        if (pathname.endsWith(".csv"))
          return new Response(ledgerCsv(data), {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": "attachment; filename=track-b-ledger.csv",
              "Cache-Control": "no-store",
            },
          });
        return json(data);
      }
      if (
        pathname === "/api/historical-case/reveal" &&
        request.method === "POST"
      ) {
        return json({
          result: cookieCats,
          branches: {
            llm: {
              pick: null,
              status: "not-recorded",
              note: "No recorded AI prediction exists for this historical case. No AI is called by this page.",
            },
            qloo: {
              pick: null,
              status: "not-applicable",
              note: "No Qloo prediction exists. Gate placement has no configured taste-entity scoring method.",
            },
          },
          purpose:
            "Historical case study only; excluded from all benchmark accuracy tallies.",
        });
      }
      if (
        pathname === "/api/historical-case/commit" &&
        request.method === "POST"
      ) {
        const receipt = makeCookieCommit(await readBody(request));
        const token = randomBytes(32).toString("hex");
        await store.set(
          `rehearsals/${receipt.id}`,
          { ...receipt, tokenHash: hash(token) },
          { onlyIfNew: true },
        );
        return json({ ...receipt, token }, 201);
      }
      const rehearsal = pathname.match(
        /^\/api\/historical-case\/([a-f0-9-]{36})(\/reveal)?$/,
      );
      if (rehearsal) {
        const receipt = await store.get(`rehearsals/${rehearsal[1]}`);
        if (!receipt) fail("Commitment not found.", 404);
        const tokenHash = hash(request.headers.get("x-commit-token") || "");
        if (
          !receipt.tokenHash ||
          !timingSafeEqual(
            Buffer.from(tokenHash),
            Buffer.from(receipt.tokenHash),
          )
        )
          fail("This commitment needs its original browser receipt.", 403);
        if (rehearsal[2] && request.method === "POST")
          await store.set(
            `revealed/${receipt.id}`,
            { at: new Date().toISOString() },
            { onlyIfNew: true },
          );
        else if (request.method !== "GET" || rehearsal[2])
          fail("This action is not supported.", 405);
        const revealed = await store.get(`revealed/${receipt.id}`);
        const { tokenHash: secret, ...publicReceipt } = receipt;
        return json({
          ...publicReceipt,
          ...(revealed
            ? {
                revealedAt: revealed.at,
                result: cookieCats,
                correct: receipt.choice === cookieCats.actual,
              }
            : {}),
        });
      }
      if (pathname === "/api/sample-live" && request.method === "GET") {
        const id = "88bd6ab2-0d0b-4b11-8d30-848b82761a20";
        if (!(await store.get(`tests/${id}`)))
          await store.set(
            `tests/${id}`,
            {
              ...sampleInput,
              ...(await predict(sampleInput, mockQlooAdapter)),
              id,
              ownerHash: hash(randomBytes(32)),
              createdAt: new Date().toISOString(),
              closedAt: null,
              isLiveSample: true,
            },
            { onlyIfNew: true },
          );
        return json(await snapshot(await store.get(`tests/${id}`)));
      }
      if (pathname === "/api/search" && request.method === "GET")
        return json(
          await qlooAdapter.searchEntities(
            (url.searchParams.get("q") || "").slice(0, 100),
            url.searchParams.get("type") || "",
          ),
        );
      if (pathname === "/api/sample" && request.method === "GET") {
        const data = await predict(sampleInput, mockQlooAdapter);
        return json(
          await snapshot({
            ...sampleInput,
            ...data,
            id: "sample",
            createdAt: "2026-10-08T12:00:00.000Z",
            closedAt: "2026-10-08T15:00:00.000Z",
            sampleVotes: [37, 15],
            isSample: true,
          }),
        );
      }
      if (pathname === "/api/tests" && request.method === "POST") {
        const input = validateInput(await readBody(request));
        const ownerToken = randomBytes(32).toString("hex");
        const test = {
          ...input,
          ...(await predict(input, adapter, aiPredictor)),
          id: randomUUID(),
          ownerHash: hash(ownerToken),
          createdAt: new Date().toISOString(),
          closedAt: null,
          freezeRequired: input.creationMode === "evidence",
        };
        await store.set(`tests/${test.id}`, test);
        return json({ test: await snapshot(test, true), ownerToken }, 201);
      }
      const match = pathname.match(
        /^\/api\/tests\/([a-f0-9-]{36})(?:\/(vote|close|open|freeze|chat))?$/,
      );
      if (!match) return json({ error: "This page could not be found." }, 404);
      const [, id, action] = match;
      const test = await store.get(`tests/${id}`);
      if (!test)
        fail("This test could not be found. Check the shared link.", 404);
      test.closedAt = (await store.get(`closed/${id}`))?.at || null;
      if (!action && request.method === "GET")
        return json(await snapshot(test, owns(test, request)));
      if (action === "chat" && request.method === "POST") {
        if (!test.closedAt)
          fail("Chat is available after the verdict is revealed.", 409);
        const closedSnapshot = await snapshot(test, true);
        const context = trackBChatContext(test, closedSnapshot);
        const body = await readBody(request);
        return json(
          await verdictChat({
            verdictKey: `track-b:${id}:${context.freeze.hash}`,
            sessionId: body.sessionId,
            question: body.question,
            context,
          }),
        );
      }
      if (action === "freeze") {
        if (test.creationMode === "quick")
          fail(
            "Quick tests already have an automatic receipt and are not eligible for Track B.",
            409,
          );
        if (!owns(test, request))
          fail("Only the creating browser can freeze predictions.", 403);
        if (await store.get(`freezes/${id}`))
          fail("Frozen predictions cannot be edited.", 409);
        if (request.method !== "POST")
          fail("This action is not supported.", 405);
        if (
          test.closedAt ||
          (await store.get(`opened/${id}`)) ||
          (await store.list(`votes/${id}/`)).length
        )
          fail("Freeze must precede poll opening and every vote.", 409);
        const work = clonePredictionWork(test.predictionWork);
        if (work) beginPredictionStep(work, "record-branches");
        let freeze;
        try {
          freeze = makeFreeze(test, await readBody(request), undefined, {
            branchesRecorded: () => {
              if (!work) return;
              finishPredictionStep(
                work,
                "record-branches",
                "AI-only, Qloo and combined branches validated and recorded.",
              );
              beginPredictionStep(work, "freeze");
            },
          });
          if (!(await store.set(`freezes/${id}`, freeze, { onlyIfNew: true })))
            fail("Frozen predictions cannot be edited.", 409);
          if (work) {
            finishPredictionStep(
              work,
              "freeze",
              `Frozen at ${freeze.payload.frozenAt} · SHA-256 ${freeze.sha256.slice(0, 12)}.`,
            );
            completePredictionWork(work, freeze);
            await store.set(`prediction-work/${id}`, work);
          }
        } catch (error) {
          if (work) {
            const active = work.steps.find((step) => step.status === "active");
            if (active)
              failPredictionStep(
                work,
                active.id,
                active.id === "freeze"
                  ? "Couldn't freeze the prediction. Nothing was revealed."
                  : "Couldn't record the branch predictions. Nothing was frozen.",
              );
            error.predictionWork = work;
          }
          throw error;
        }
        return json(await snapshot(test, true), 201);
      }
      if (action === "open" && request.method === "POST") {
        if (!owns(test, request))
          fail("Only the creating browser can open this poll.", 403);
        if (!test.comparison && !(await store.get(`freezes/${id}`)))
          fail("Freeze predictions before opening the poll.", 409);
        if (test.closedAt) fail("This poll has closed.", 409);
        await store.set(
          `opened/${id}`,
          { at: new Date().toISOString() },
          { onlyIfNew: true },
        );
        return json(await snapshot(test, true));
      }
      if (action === "close" && request.method === "POST") {
        if (test.isLiveSample)
          fail(
            "The live demo remains open. Create your own test to close it.",
            403,
          );
        const token = request.headers.get("x-owner-token") || "";
        const tokenHash = hash(token);
        if (
          !timingSafeEqual(Buffer.from(tokenHash), Buffer.from(test.ownerHash))
        )
          fail("Only the browser that created this test can close it.", 403);
        if (
          (test.comparison || test.freezeRequired) &&
          !(await store.get(`opened/${id}`))
        )
          fail("Open the poll before closing it.", 409);
        // An immutable close marker makes repeated/concurrent close requests idempotent.
        if (!test.closedAt)
          await store.set(
            `closed/${id}`,
            { at: new Date().toISOString() },
            { onlyIfNew: true },
          );
        const result = await snapshot(test, true);
        if (result.freeze) {
          const payload = result.freeze.payload;
          await store.set(
            `benchmark-results/${id}`,
            {
              id,
              caseLabel: payload.caseLabel,
              mode: payload.mode,
              track: payload.metadata.track,
              frozenAt: payload.frozenAt,
              closedAt: result.closedAt,
              branches: Object.fromEntries(
                Object.entries(payload.branches).map(([key, branch]) => [
                  key,
                  {
                    pick: branch.pick,
                    confidence: branch.confidence,
                    source: branch.source,
                  },
                ]),
              ),
              result: result.benchmarkResult,
            },
            { onlyIfNew: true },
          );
        }
        return json(result);
      }
      if (action === "vote" && request.method === "POST") {
        if (test.closedAt)
          fail("This poll has closed. You can still read the verdict.", 409);
        if (!test.isLiveSample && !(await store.get(`opened/${id}`)))
          fail(
            "Predictions are locked, but the owner has not opened this poll yet.",
            409,
          );
        const body = await readBody(request);
        if (
          ![0, 1].includes(body.option) ||
          typeof body.voterId !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(body.voterId)
        )
          fail("Please choose A or B.");
        const vote = { option: body.option, at: new Date().toISOString() };
        const stored = await store.set(
          `votes/${id}/${hash(body.voterId)}`,
          vote,
          { onlyIfNew: true },
        );
        if (!stored) fail("You have already voted in this poll.", 409);
        const latest = await store.get(`tests/${id}`);
        latest.closedAt = (await store.get(`closed/${id}`))?.at || null;
        if (latest.closedAt && vote.at > latest.closedAt)
          fail("This poll closed before your vote arrived.", 409);
        return json(await snapshot(latest));
      }
      return json({ error: "This action is not supported." }, 405);
    } catch (error) {
      if (!error.status) console.error("API failure:", error.message);
      return json(
        {
          error: error.status
            ? error.message
            : "Something went wrong. Please try again.",
          ...(error.predictionWork
            ? { predictionWork: error.predictionWork }
            : {}),
        },
        error.status || 500,
      );
    }
  };
}
