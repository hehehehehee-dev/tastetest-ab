export const predictionWorkStages = [
  ["resolve-seeds", "Resolving taste seeds → Qloo entities"],
  ["resolve-candidates", "Resolving the two candidates → entities"],
  ["fetch-affinities", "Fetching affinity signals"],
  ["score-fit", "Scoring audience fit"],
  ["record-branches", "Recording branch predictions (LLM-only / Qloo / Agent)"],
  ["freeze", "Freezing the prediction (timestamp + SHA-256)"],
];

export function createPredictionWork({
  mode = "real",
  context = "track-b",
} = {}) {
  return {
    mode,
    context,
    steps: predictionWorkStages.map(([id, label]) => ({
      id,
      label,
      status: "pending",
      elapsedMs: null,
      detail: "",
      message: "",
    })),
  };
}

export const clonePredictionWork = (work) =>
  work ? JSON.parse(JSON.stringify(work)) : null;

export function beginPredictionStep(work, id, now = Date.now()) {
  const step = work.steps.find((item) => item.id === id);
  if (!step) throw Error(`Unknown prediction-work step: ${id}`);
  step.status = "active";
  step.startedAt = new Date(now).toISOString();
  step.elapsedMs = null;
  step.detail = "";
  step.message = "";
  return step;
}

export function finishPredictionStep(work, id, detail = "", now = Date.now()) {
  const step = work.steps.find((item) => item.id === id);
  if (!step) throw Error(`Unknown prediction-work step: ${id}`);
  const started = Date.parse(step.startedAt || new Date(now).toISOString());
  step.status = "done";
  step.completedAt = new Date(now).toISOString();
  step.elapsedMs = Math.max(0, now - started);
  step.detail = detail;
  step.message = "";
  return step;
}

export function failPredictionStep(work, id, message, now = Date.now()) {
  const step = work.steps.find((item) => item.id === id);
  if (!step) throw Error(`Unknown prediction-work step: ${id}`);
  const started = Date.parse(step.startedAt || new Date(now).toISOString());
  step.status = "failed";
  step.completedAt = new Date(now).toISOString();
  step.elapsedMs = Math.max(0, now - started);
  step.detail = "";
  step.message = message;
  return step;
}

export async function runPredictionStep(
  work,
  id,
  task,
  detail,
  friendlyFailure,
) {
  beginPredictionStep(work, id);
  try {
    const value = await task();
    finishPredictionStep(
      work,
      id,
      typeof detail === "function" ? detail(value) : detail,
    );
    return value;
  } catch (error) {
    failPredictionStep(work, id, friendlyFailure);
    error.predictionWork = clonePredictionWork(work);
    throw error;
  }
}

export function predictionWorkElapsed(work) {
  return (work?.steps || []).reduce(
    (total, step) =>
      total + (Number.isFinite(step.elapsedMs) ? step.elapsedMs : 0),
    0,
  );
}

export function completePredictionWork(work, freeze) {
  work.frozenAt = freeze.payload.frozenAt;
  work.sha256 = freeze.sha256;
  return work;
}
