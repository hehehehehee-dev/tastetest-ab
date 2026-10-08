import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const hash = (x) => createHash("sha256").update(x).digest("hex");
const load = async (p) => JSON.parse(await readFile(p, "utf8"));
const writeNew = async (p, value) =>
  writeFile(p, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const check = (condition, message) => {
  if (!condition) throw Error(message);
};
const validDate = (v) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));

export function validateDraft(draft) {
  check(
    draft.cases?.length >= 20 && draft.cases.length <= 30,
    "Register 20–30 cases before polling.",
  );
  check(
    new Set(draft.cases.map((c) => c.id)).size === draft.cases.length,
    "Case IDs must be unique.",
  );
  check(
    Number.isInteger(draft.protocol?.minimumVotes) &&
      draft.protocol.minimumVotes >= 20,
    "Declare at least 20 responses per case (a quality floor, not a power calculation).",
  );
  check(
    validDate(draft.protocol?.closesAt) &&
      Date.parse(draft.protocol.closesAt) > Date.now(),
    "Declare a future fixed closing deadline.",
  );
  check(
    draft.protocol?.recruitment?.trim(),
    "Declare the matched-audience recruitment and taste screening rule.",
  );
  check(
    draft.protocol?.duplicatePolicy?.trim(),
    "Declare duplicate respondent handling.",
  );
  check(
    draft.protocol?.aiPromptPolicy?.trim() &&
      draft.protocol?.qlooScoringPolicy?.trim(),
    "Freeze the blind AI prompt policy and Qloo scoring/tie rules.",
  );
  for (const c of draft.cases) {
    check(
      c.status === "ready" && c.audience?.trim(),
      `${c.id}: confirm audience and ready status.`,
    );
    check(
      c.seeds?.length >= 3 &&
        c.seeds.length <= 5 &&
        c.seeds.every(
          (s) => s.name && s.entityId && !s.entityId.startsWith("mock-"),
        ),
      `${c.id}: resolve 3–5 real Qloo seed entities.`,
    );
    check(
      c.options?.length === 2 &&
        c.options.every(
          (o) =>
            o.title &&
            o.description &&
            o.entityIds?.length &&
            o.entityIds.every(
              (id) => typeof id === "string" && id && !id.startsWith("mock-"),
            ),
        ),
      `${c.id}: resolve both options to real Qloo entities; confirm they can be scored.`,
    );
    for (const model of ["ai", "qloo"]) {
      const p = c.predictions?.[model];
      check(
        p &&
          ["A", "B", "tie"].includes(p.choice) &&
          p.model?.trim() &&
          p.rationale?.trim() &&
          validDate(p.generatedAt) &&
          Date.parse(p.generatedAt) <= Date.now() &&
          p.artifact,
        `${c.id}: supply actual ${model} prediction, model/version, rationale, time and raw artifact path.`,
      );
      check(
        p.mode === "real",
        `${c.id}: mock or illustrative predictions cannot enter the study.`,
      );
    }
  }
  return draft;
}

export function summarizeStudy(lock, opening, rows) {
  check(Array.isArray(rows), "Results must be an array.");
  check(
    new Set(rows.map((r) => r.id)).size === rows.length,
    "Duplicate result IDs.",
  );
  check(
    rows.every((r) => lock.cases.some((c) => c.id === r.id)),
    "Unknown result case.",
  );
  const report = {
    registered: lock.cases.length,
    evaluated: 0,
    excluded: [],
    rows: [],
    aiCorrect: 0,
    qlooCorrect: 0,
    aiOnly: 0,
    qlooOnly: 0,
  };
  for (const c of lock.cases) {
    const r = rows.find((r) => r.id === c.id);
    if (!r) {
      report.excluded.push({ id: c.id, reason: "No result supplied" });
      continue;
    }
    check(
      Number.isInteger(r.votesA) &&
        r.votesA >= 0 &&
        Number.isInteger(r.votesB) &&
        r.votesB >= 0,
      `${c.id}: invalid counts.`,
    );
    check(
      validDate(r.collectionStartedAt) &&
        Date.parse(r.collectionStartedAt) >= Date.parse(opening.openedAt),
      `${c.id}: collection must start after opening.`,
    );
    check(
      validDate(r.closedAt) &&
        Date.parse(r.closedAt) >= Date.parse(lock.protocol.closesAt) &&
        Date.parse(r.closedAt) <= Date.now(),
      `${c.id}: close only at/after the registered deadline, never in the future.`,
    );
    check(
      r.source?.trim() &&
        r.artifactSha256 &&
        r.audienceMatched === true &&
        r.randomizedOrder === true &&
        r.deduplicated === true,
      `${c.id}: require source, raw-result artifact, screened audience, randomized presentation and deduplication.`,
    );
    const total = r.votesA + r.votesB;
    const winner =
      r.votesA === r.votesB ? "tie" : r.votesA > r.votesB ? "A" : "B";
    const row = {
      id: c.id,
      ai: c.predictions.ai.choice,
      qloo: c.predictions.qloo.choice,
      observed: winner,
      votesA: r.votesA,
      votesB: r.votesB,
    };
    report.rows.push(row);
    if (total < lock.protocol.minimumVotes || winner === "tie") {
      report.excluded.push({
        id: c.id,
        reason:
          total < lock.protocol.minimumVotes
            ? "Below registered minimum"
            : "Observed tie",
      });
      continue;
    }
    report.evaluated++;
    const ai = row.ai === winner,
      qloo = row.qloo === winner;
    report.aiCorrect += +ai;
    report.qlooCorrect += +qloo;
    report.aiOnly += +(ai && !qloo);
    report.qlooOnly += +(qloo && !ai);
  }
  const n = report.aiOnly + report.qlooOnly;
  let term = 2 ** -n,
    cumulative = term;
  for (let k = 1; k <= Math.min(report.aiOnly, report.qlooOnly); k++) {
    term *= (n - k + 1) / k;
    cumulative += term;
  }
  report.exactMcNemarP = n ? Math.min(1, 2 * cumulative) : 1;
  report.accuracy = report.evaluated
    ? {
        ai: report.aiCorrect / report.evaluated,
        qloo: report.qlooCorrect / report.evaluated,
      }
    : null;
  report.claim =
    report.evaluated < 20
      ? "Pilot only: fewer than 20 evaluable cases."
      : `On these ${report.evaluated} cases, AI matched ${report.aiCorrect} observed winners and Qloo matched ${report.qlooCorrect}. This convenience sample does not establish general superiority.`;
  report.limitations =
    "Same cases paired; exact two-sided McNemar on discordant correctness pairs. Majority preferences are noisy, not causal business outcomes. Reused audiences/correlated cases weaken independence. Report all exclusions and raw counts; no cherry-picking or stopping at a favorable result.";
  return report;
}

async function bindArtifacts(cases, base) {
  for (const c of cases)
    for (const key of ["ai", "qloo"]) {
      const p = c.predictions[key];
      p.artifactSha256 = hash(await readFile(path.resolve(base, p.artifact)));
    }
}
async function verifyLock(directory) {
  const raw = await readFile(path.join(directory, "locked.json"));
  const manifest = await load(path.join(directory, "lock-manifest.json"));
  check(
    hash(raw) === manifest.sha256,
    "Locked predictions changed; do not continue this campaign.",
  );
  return { lock: JSON.parse(raw), manifest };
}

async function run() {
  const [command, target, input] = process.argv.slice(2);
  const directory = path.resolve(target || "research/private");
  if (command === "lock") {
    const draft = validateDraft(await load(path.join(directory, "draft.json")));
    await bindArtifacts(draft.cases, directory);
    const lock = { ...draft, lockedAt: new Date().toISOString() };
    await writeNew(path.join(directory, "locked.json"), lock);
    const sha256 = hash(await readFile(path.join(directory, "locked.json")));
    await writeNew(path.join(directory, "lock-manifest.json"), {
      sha256,
      lockedAt: lock.lockedAt,
    });
    console.log(
      "Locked. Publish only the SHA-256 digest with an independent timestamp before opening; keep cases private.",
    );
  } else if (command === "open") {
    const { lock, manifest } = await verifyLock(directory);
    check(
      input,
      "Provide a JSON independent timestamp receipt: {sha256, timestamp, reference}.",
    );
    const receipt = await load(input);
    check(
      receipt.sha256 === manifest.sha256 &&
        validDate(receipt.timestamp) &&
        Date.parse(receipt.timestamp) >= Date.parse(lock.lockedAt) &&
        Date.parse(receipt.timestamp) <= Date.now() &&
        receipt.reference?.trim(),
      "Timestamp receipt must reference this digest after lock and before opening.",
    );
    check(
      Date.now() < Date.parse(lock.protocol.closesAt),
      "The registered deadline has passed.",
    );
    await writeNew(path.join(directory, "opened.json"), {
      openedAt: new Date().toISOString(),
      sha256: manifest.sha256,
      timestampReceipt: receipt,
    });
    console.log(
      "Open. Collect blind votes; do not show either prediction to respondents.",
    );
  } else if (command === "score") {
    const { lock, manifest } = await verifyLock(directory);
    const opening = await load(path.join(directory, "opened.json"));
    check(
      opening.sha256 === manifest.sha256 &&
        Date.parse(opening.openedAt) >= Date.parse(lock.lockedAt),
      "Opening does not match the lock.",
    );
    check(input, "Provide a results JSON file.");
    const rows = await load(input);
    for (const r of rows) {
      check(r.artifact, `${r.id}: raw-result artifact path required.`);
      r.artifactSha256 = hash(
        await readFile(
          path.resolve(path.dirname(path.resolve(input)), r.artifact),
        ),
      );
    }
    const report = {
      ...summarizeStudy(lock, opening, rows),
      generatedAt: new Date().toISOString(),
      lockSha256: manifest.sha256,
      results: rows,
    };
    await writeNew(path.join(directory, `report-${Date.now()}.json`), report);
    console.log(JSON.stringify(report, null, 2));
  } else
    throw Error(
      "Usage: node research/study.mjs lock|open|score <private-directory> [receipt/results.json]",
    );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  run().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
