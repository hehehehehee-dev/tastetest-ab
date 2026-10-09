const fail = (message, status = 503) => {
  throw Object.assign(Error(message), { status });
};
const versionPattern = /^[a-f0-9]{64}$/;
const createGate = {
  tail: Promise.resolve(),
  lastStartedAt: 0,
  blockedUntil: 0,
};
export function createReplicatePredictor({
  token,
  model,
  version,
  instructions,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 45000,
  minCreateIntervalMs = 11000,
  gate = createGate,
} = {}) {
  return async (context) => {
    if (
      !token ||
      model !== "openai/gpt-4.1-mini" ||
      !versionPattern.test(version || "")
    )
      fail(
        "Replicate comparison needs REPLICATE_API_TOKEN, REPLICATE_MODEL=openai/gpt-4.1-mini and a pinned REPLICATE_VERSION on the server.",
      );
    const input = JSON.stringify(context);
    const system = `${instructions}\nReturn only a JSON object with exactly these fields: choice (\"A\", \"B\", or \"TIE\"), confidence (an integer from 0 to 100), rationale (a short nonempty explanation, at most 1200 characters). Do not use Markdown fences or other text.`;
    const settings = {
      temperature: 0,
      top_p: 1,
      max_completion_tokens: 700,
      presence_penalty: 0,
      frequency_penalty: 0,
    };
    const startedAt = new Date().toISOString();
    const deadline = Date.now() + timeoutMs;
    let predictionId;
    async function request(path, method = "GET", body) {
      const creating = method === "POST" && path === "/predictions";
      let release;
      if (creating) {
        const previous = gate.tail;
        gate.tail = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        const delay = Math.max(
          0,
          gate.lastStartedAt + minCreateIntervalMs - Date.now(),
          gate.blockedUntil - Date.now(),
        );
        if (Date.now() + delay >= deadline) {
          release();
          fail(
            "Replicate creation queue is busy or cooling down. Retry later.",
            429,
          );
        }
        if (delay) await sleep(delay);
        gate.lastStartedAt = Date.now();
      }
      let response;
      try {
        response = await fetchImpl(`https://api.replicate.com/v1${path}`, {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(method === "POST" && path === "/predictions"
              ? { Prefer: "wait=10", "Cancel-After": "45s" }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (response.status === 429) {
          const retry = response.headers.get("retry-after");
          const seconds = Number(retry);
          const delay = !retry
            ? 30000
            : Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(retry) - Date.now();
          gate.blockedUntil =
            Date.now() + Math.max(1000, Number.isFinite(delay) ? delay : 30000);
        }
      } catch {
        fail(
          "Replicate is unreachable or timed out. No automatic prediction retry was made.",
        );
      } finally {
        release?.();
      }
      if (!response.ok)
        fail(
          response.status === 429
            ? "Replicate quota or rate limit reached. Retry later."
            : "Replicate rejected the request. Check its server token, pinned model access and account credit.",
          response.status === 429 ? 429 : 503,
        );
      try {
        return await response.json();
      } catch {
        fail("Replicate returned an invalid response.", 502);
      }
    }
    try {
      let prediction = await request("/predictions", "POST", {
        version,
        input: {
          messages: [
            { role: "system", content: system },
            { role: "user", content: input },
          ],
          ...settings,
        },
      });
      if (
        typeof prediction.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(prediction.id)
      )
        fail("Replicate returned an invalid prediction ID.", 502);
      predictionId = prediction.id;
      while (["starting", "processing"].includes(prediction.status)) {
        if (Date.now() + 1000 >= deadline)
          fail("Replicate prediction timed out. No comparison was committed.");
        await sleep(1000);
        prediction = await request(`/predictions/${predictionId}`);
        if (prediction.id !== predictionId)
          fail("Replicate returned a mismatched prediction.", 502);
      }
      const hiddenVersion =
        prediction.version === "hidden" && prediction.model === model;
      if (
        prediction.status !== "succeeded" ||
        (prediction.version !== version && !hiddenVersion)
      )
        fail(
          "Replicate did not complete the pinned model prediction. No comparison was committed.",
          502,
        );
      let result;
      try {
        const output =
          Array.isArray(prediction.output) &&
          prediction.output.every((x) => typeof x === "string")
            ? prediction.output.join("")
            : typeof prediction.output === "string"
              ? prediction.output
              : "";
        result = JSON.parse(output.trim());
        if (
          !result ||
          Object.keys(result).sort().join(",") !==
            "choice,confidence,rationale" ||
          !["A", "B", "TIE"].includes(result.choice) ||
          !Number.isInteger(result.confidence) ||
          result.confidence < 0 ||
          result.confidence > 100 ||
          typeof result.rationale !== "string" ||
          !result.rationale.trim() ||
          result.rationale.length > 2400
        )
          throw Error();
      } catch {
        fail(
          "Replicate model returned an invalid decision. No comparison was committed or retried.",
          502,
        );
      }
      return {
        ...result,
        provider: "replicate",
        requestedModel: model,
        model: `${model}:${version}`,
        returnedModel: prediction.model || null,
        returnedVersion: prediction.version,
        versionVerification: hiddenVersion
          ? "Provider hides returned version; requested adapter version is recorded, underlying model snapshot is not attested."
          : "Returned adapter version matches requested version.",
        responseId: predictionId,
        startedAt,
        finishedAt: new Date().toISOString(),
        prompt: { instructions: system, input },
        settings,
      };
    } catch (error) {
      if (predictionId) {
        // Cancel this exact job on timeout/failure; never create a replacement job or trust returned URLs.
        try {
          await fetchImpl(
            `https://api.replicate.com/v1/predictions/${predictionId}/cancel`,
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(3000),
              headers: { Authorization: `Bearer ${token}` },
            },
          );
        } catch {}
      }
      throw error;
    }
  };
}
