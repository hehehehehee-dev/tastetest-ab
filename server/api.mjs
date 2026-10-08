import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { qlooAdapter, scoreWithoutQloo } from "./qlooAdapter.mjs";
import { sampleInput } from "./fixtures.mjs";
import { makeCookieCommit } from "./cookieCats.mjs";
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

async function predict(input) {
  const search = await qlooAdapter.searchEntities();
  const seeds = search.results.entities.filter((e) =>
    input.seedEntityIds.includes(e.entity_id),
  );
  const insights = await qlooAdapter.getInsights(input.seedEntityIds);
  const profile = { seeds, insights, note: input.audienceNote };
  return {
    seeds,
    prediction: await Promise.all(
      input.options.map((o) => qlooAdapter.scoreOption(o, profile)),
    ),
    baseline: input.options.map((o) =>
      scoreWithoutQloo(o, seeds, input.audienceNote),
    ),
    insights: insights.results.entities
      .slice(0, 3)
      .map((e) => ({ name: e.name, affinity: e.query.affinity })),
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
  };
}
function verdict(test, counts) {
  const total = counts[0] + counts[1];
  const actual =
    !total || counts[0] === counts[1] ? null : counts[0] > counts[1] ? 0 : 1;
  const predicted =
    test.prediction[0].score === test.prediction[1].score
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
      : `${test.options[actual].title} received ${share}% of ${total} votes. ${predicted === null ? "The mock prediction was tied, so the poll provides the first clear direction." : actual === predicted ? "The audience result supports the mock cultural prediction." : "The audience chose differently from the mock cultural prediction; favor the observed preference."} Use this option for a small trial, then measure real outcomes. This is a convenience poll, not a representative study.`;
  return { actual, predicted, share, recommendation };
}
export function createApi(store) {
  async function snapshot(test) {
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
    const { ownerHash, ...publicTest } = test;
    return {
      ...publicTest,
      votes: counts,
      totalVotes: counts[0] + counts[1],
      verdict: test.closedAt ? verdict(test, counts) : null,
      mode: "mock",
    };
  }
  async function readBody(request) {
    const raw = await request.text();
    if (raw.length > 12000) fail("This request is too large.", 413);
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
      if (pathname === "/api/cookie-cats/commit" && request.method === "POST") {
        const receipt = makeCookieCommit(await readBody(request));
        await store.set(`rehearsals/${receipt.id}`, receipt, {
          onlyIfNew: true,
        });
        return json(receipt, 201);
      }
      if (pathname === "/api/search" && request.method === "GET")
        return json(
          await qlooAdapter.searchEntities(
            (url.searchParams.get("q") || "").slice(0, 100),
            url.searchParams.get("type") || "",
          ),
        );
      if (pathname === "/api/sample" && request.method === "GET") {
        const data = await predict(sampleInput);
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
        const validIds = (
          await qlooAdapter.searchEntities()
        ).results.entities.map((e) => e.entity_id);
        if (input.seedEntityIds.some((id) => !validIds.includes(id)))
          fail(
            "One of the selected taste seeds is unavailable. Please select it again.",
          );
        const ownerToken = randomBytes(32).toString("hex");
        const test = {
          ...input,
          ...(await predict(input)),
          id: randomUUID(),
          ownerHash: hash(ownerToken),
          createdAt: new Date().toISOString(),
          closedAt: null,
        };
        await store.set(`tests/${test.id}`, test);
        return json({ test: await snapshot(test), ownerToken }, 201);
      }
      const match = pathname.match(
        /^\/api\/tests\/([a-f0-9-]{36})(?:\/(vote|close))?$/,
      );
      if (!match) return json({ error: "This page could not be found." }, 404);
      const [, id, action] = match;
      const test = await store.get(`tests/${id}`);
      if (!test)
        fail("This test could not be found. Check the shared link.", 404);
      test.closedAt = (await store.get(`closed/${id}`))?.at || null;
      if (!action && request.method === "GET")
        return json(await snapshot(test));
      if (action === "close" && request.method === "POST") {
        const token = request.headers.get("x-owner-token") || "";
        const tokenHash = hash(token);
        if (
          !timingSafeEqual(Buffer.from(tokenHash), Buffer.from(test.ownerHash))
        )
          fail("Only the browser that created this test can close it.", 403);
        // An immutable close marker makes repeated/concurrent close requests idempotent.
        if (!test.closedAt)
          await store.set(
            `closed/${id}`,
            { at: new Date().toISOString() },
            { onlyIfNew: true },
          );
        return json(await snapshot(test));
      }
      if (action === "vote" && request.method === "POST") {
        if (test.closedAt)
          fail("This poll has closed. You can still read the verdict.", 409);
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
