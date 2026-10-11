import test from "node:test";
import assert from "node:assert/strict";
import {
  beginPredictionStep,
  completePredictionWork,
  createPredictionWork,
  finishPredictionStep,
  predictionWorkStages,
  runPredictionStep,
} from "../shared/predictionWork.mjs";

test("prediction work keeps all six real stages in the locked order", () => {
  const work = createPredictionWork({ mode: "mock", context: "proxy-film" });
  assert.deepEqual(
    work.steps.map(({ id, status }) => [id, status]),
    predictionWorkStages.map(([id]) => [id, "pending"]),
  );
  for (const [id] of predictionWorkStages) {
    beginPredictionStep(work, id, 1000);
    finishPredictionStep(work, id, `${id} complete`, 1250);
  }
  completePredictionWork(work, {
    payload: { frozenAt: "2026-10-11T12:00:00.000Z" },
    sha256: "a1b2c3".padEnd(64, "0"),
  });
  assert.equal(
    work.steps.every((step) => step.status === "done"),
    true,
  );
  assert.equal(work.sha256.startsWith("a1b2c3"), true);
});

test("a failed Qloo stage is marked precisely with a friendly message", async () => {
  const work = createPredictionWork({ mode: "real" });
  await assert.rejects(
    runPredictionStep(
      work,
      "fetch-affinities",
      async () => {
        throw Error("socket trace: secret internal failure");
      },
      "unused",
      "Couldn't reach Qloo for candidate affinities. No prediction was recorded.",
    ),
    (error) => {
      const failed = error.predictionWork.steps.find(
        (step) => step.id === "fetch-affinities",
      );
      assert.equal(failed.status, "failed");
      assert.equal(
        failed.message,
        "Couldn't reach Qloo for candidate affinities. No prediction was recorded.",
      );
      assert.doesNotMatch(JSON.stringify(error.predictionWork), /socket trace/);
      return true;
    },
  );
});

test("mock and real work retain their honest mode labels", () => {
  assert.equal(createPredictionWork({ mode: "mock" }).mode, "mock");
  assert.equal(createPredictionWork({ mode: "real" }).mode, "real");
});
