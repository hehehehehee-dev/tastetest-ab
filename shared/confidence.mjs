// Heuristic separation of mock fit scores, not a calibrated correctness probability.
export function predictionConfidence(scores) {
  const gap = Math.abs(scores[0].score - scores[1].score);
  const level = gap < 10 ? "Low" : gap < 25 ? "Moderate" : "High";
  return {
    gap,
    level,
    tooClose: gap < 10,
    affinityGap: Math.abs(
      (scores[0].components?.affinity || 0) -
        (scores[1].components?.affinity || 0),
    ),
  };
}
