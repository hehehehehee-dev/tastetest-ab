// Read frozen evidence only. Legacy receipts keep their original hash and data.
export function recordedQlooEvidence(test) {
  if (test?.mode !== "real") return null;
  const payload = test.comparison?.payload;
  if (payload?.qlooEvidence?.source === "Qloo API") return payload.qlooEvidence;
  const input = payload?.aiQloo?.prompt?.input;
  if (typeof input !== "string" || input.length > 250000) return null;
  try {
    const evidence = JSON.parse(input)?.qlooSignals;
    return evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? evidence
      : null;
  } catch {
    return null;
  }
}

export function seedExplanations(evidence, affinities = []) {
  const seeds = new Map(
    (Array.isArray(evidence?.seeds) ? evidence.seeds : [])
      .filter(
        (seed) =>
          typeof seed?.entity_id === "string" &&
          typeof seed?.name === "string" &&
          seed.name.trim(),
      )
      .map((seed) => [seed.entity_id.toLowerCase(), seed.name]),
  );
  const labels = new Map(
    (Array.isArray(affinities) ? affinities : [])
      .filter(
        (signal) =>
          typeof signal?.entityId === "string" &&
          ["A", "B"].includes(signal.label),
      )
      .map((signal) => [signal.entityId.toLowerCase(), signal.label]),
  );
  return (
    Array.isArray(evidence?.recommendations) ? evidence.recommendations : []
  )
    .slice(0, 3)
    .filter(
      (signal) =>
        typeof signal?.entity_id === "string" &&
        typeof signal?.name === "string",
    )
    .map((signal) => {
      const values = signal.explainability?.["signal.interests.entities"];
      const seen = new Set();
      const contributors = (Array.isArray(values) ? values : [])
        .filter((value) => {
          const id =
            typeof value?.entity_id === "string"
              ? value.entity_id.toLowerCase()
              : "";
          if (
            !seeds.has(id) ||
            seen.has(id) ||
            !Number.isFinite(value.score) ||
            value.score < 0 ||
            value.score > 1
          )
            return false;
          seen.add(id);
          return true;
        })
        .map((value) => ({
          id: value.entity_id,
          name: seeds.get(value.entity_id.toLowerCase()),
          score: value.score,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      return {
        id: signal.entity_id,
        name: signal.name,
        label: labels.get(signal.entity_id.toLowerCase()),
        contributors,
      };
    })
    .filter((signal) => signal.contributors.length);
}
