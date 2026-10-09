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
import { createComparison, scoreComparison } from "./aiComparison.mjs";
import { createProxyApi } from "./proxy.mjs";
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
  const seeds = await adapter.resolveEntities(input.seedEntityIds);
  const insights = await adapter.getInsights(input.seedEntityIds, [
    input.insightType || typeUrns.Dining,
  ]);
  const profile = { seeds, insights, note: input.audienceNote };
  return {
    seeds,
    ...(input.compareAi
      ? {
          comparison: await createComparison(
            input,
            seeds,
            insights,
            aiPredictor,
          ),
        }
      : {}),
    prediction: await Promise.all(
      input.options.map((o) => adapter.scoreOption(o, profile)),
    ),
    baseline: input.options.map((o) =>
      scoreWithoutQloo(o, seeds, input.audienceNote),
    ),
    insights: insights.results.entities
      .slice(0, 3)
      .map((e) => ({ name: e.name, affinity: e.query.affinity })),
    mode: insights.mode,
    scoringVersion: "concept-tag-fit-v2",
    provenance: {
      source: insights.mode === "real" ? "Qloo API" : "Synthetic fixtures",
      fetchedAt: insights.fetchedAt || null,
      targetTypes: insights.targetTypes || [],
      mapping:
        "Local concept/tag overlap heuristic; Qloo affinity is not a prediction of votes.",
    },
  };
}
function validateInput(body) {
  if (!body || !Array.isArray(body.options) || body.options.length !== 2)
    fail("Please provide two options.");
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
      o.description.trim().length < 10 ||
      o.description.length > 1200
    )
      fail(`Describe option ${index ? "B" : "A"} in 10–1,200 characters.`);
    const imageUrl = typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
    if (imageUrl) {
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
    };
  });
  if (
    !Array.isArray(body.seedEntityIds) ||
    body.seedEntityIds.length < 3 ||
    body.seedEntityIds.length > 5 ||
    new Set(body.seedEntityIds).size !== body.seedEntityIds.length
  )
    fail("Choose 3–5 different taste seeds.");
  if (
    body.audienceNote != null &&
    (typeof body.audienceNote !== "string" || body.audienceNote.length > 300)
  )
    fail("Keep the audience note under 300 characters.");
  return {
    options,
    seedEntityIds: body.seedEntityIds,
    audienceNote: (body.audienceNote || "").trim(),
    title: `${options[0].title} vs. ${options[1].title}`,
    insightType:
      typeUrns[body.insightCategory || "Dining"] ||
      fail("Select a supported recommendation context."),
    compareAi: body.compareAi === true,
    benchmarkMetadata: validateMetadata(body.benchmarkMetadata),
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
  { adapter = qlooAdapter, aiPredictor, proxyOptions = {} } = {},
) {
  const proxyApi = createProxyApi(store, { adapter, ...proxyOptions });
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
    const freeze = await store.get(`freezes/${test.id}`);
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
      const proxyResponse = await proxyApi(request, pathname, readBody);
      if (proxyResponse)
        return json(proxyResponse.data, proxyResponse.status || 200);
      if (pathname === "/api/config" && request.method === "GET")
        return json({
          mode: isMockMode() ? "mock" : "real",
          configured: isMockMode() || !!process.env.QLOO_API_KEY,
          ai: {
            configured: false,
            provider: "manual",
            label: "LLM-only (manual paste)",
          },
        });
      if (pathname === "/api/benchmark" && request.method === "GET") {
        const rows = (
          await Promise.all(
            (await store.list("benchmark-results/")).map((key) =>
              store.get(key),
            ),
          )
        ).filter(Boolean);
        return json({ rows, tally: benchmarkTally(rows) });
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
        if (input.compareAi && !aiPredictor)
          fail(
            "Paid LLM calls are disabled. Use LLM-only (manual paste).",
            503,
          );
        const ownerToken = randomBytes(32).toString("hex");
        const test = {
          ...input,
          ...(await predict(input, adapter, aiPredictor)),
          id: randomUUID(),
          ownerHash: hash(ownerToken),
          createdAt: new Date().toISOString(),
          closedAt: null,
          freezeRequired: !input.compareAi,
        };
        await store.set(`tests/${test.id}`, test);
        return json({ test: await snapshot(test, true), ownerToken }, 201);
      }
      const match = pathname.match(
        /^\/api\/tests\/([a-f0-9-]{36})(?:\/(vote|close|open|freeze))?$/,
      );
      if (!match) return json({ error: "This page could not be found." }, 404);
      const [, id, action] = match;
      const test = await store.get(`tests/${id}`);
      if (!test)
        fail("This test could not be found. Check the shared link.", 404);
      test.closedAt = (await store.get(`closed/${id}`))?.at || null;
      if (!action && request.method === "GET")
        return json(await snapshot(test, owns(test, request)));
      if (action === "freeze") {
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
        const freeze = makeFreeze(test, await readBody(request));
        if (!(await store.set(`freezes/${id}`, freeze, { onlyIfNew: true })))
          fail("Frozen predictions cannot be edited.", 409);
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
        },
        error.status || 500,
      );
    }
  };
}
