import { entities, affinityFixtures, typeUrns } from "./fixtures.mjs";

function ensureMock() {
  if (process.env.USE_QLOO_MOCK === "false")
    throw Object.assign(
      new Error(
        "Real Qloo mode is not implemented yet. Set USE_QLOO_MOCK=true.",
      ),
      { status: 503 },
    );
}
export function tokenize(value) {
  return new Set(
    String(value)
      .toLowerCase()
      .match(/[a-z]+/g) || [],
  );
}
function tagsFor(option) {
  const words = tokenize(`${option.title} ${option.description}`);
  const aliases = {
    handmade: "craft",
    artisanal: "craft",
    vintage: "nostalgic",
    retro: "nostalgic",
    neon: "bright",
    botanical: "nature",
    sustainable: "nature",
    vegan: "plant",
    quiet: "calm",
    minimalism: "minimal",
    energetic: "energy",
    independent: "indie",
    colorful: "colorful",
  };
  for (const [word, tag] of Object.entries(aliases))
    if (words.has(word)) words.add(tag);
  return words;
}
export const qlooAdapter = {
  async searchEntities(query = "", type = "") {
    ensureMock();
    return {
      results: {
        entities: entities.filter(
          (e) =>
            (!type || e.category === type || e.types.includes(type)) &&
            e.name.toLowerCase().includes(query.toLowerCase()),
        ),
      },
      mode: "mock",
    };
  },
  async getInsights(seedEntityIds, targetTypes = Object.values(typeUrns)) {
    ensureMock();
    const seeds = entities.filter((e) => seedEntityIds.includes(e.entity_id));
    const tags = seeds.flatMap((e) => e.tags.map((t) => t.name));
    const related = affinityFixtures
      .map((e) => {
        const matches = e.tags.filter((tag) => tags.includes(tag));
        return {
          entity_id: e.entity_id,
          name: e.name,
          types: [typeUrns.Dining],
          tags: e.tags.map((name) => ({ name, tag_id: `mock-tag-${name}` })),
          query: {
            affinity: +((e.affinity * matches.length) / e.tags.length).toFixed(
              3,
            ),
          },
        };
      })
      .filter((e) => e.query.affinity > 0)
      .sort((a, b) => b.query.affinity - a.query.affinity);
    return {
      results: { entities: related },
      query: {
        signal: { entities: seedEntityIds },
        filter: { type: targetTypes },
      },
      mode: "mock",
    };
  },
  async scoreOption(option, audienceProfile) {
    ensureMock();
    const words = tagsFor(option);
    const insights = audienceProfile.insights.results.entities;
    const audienceTags = [
      ...new Set(
        audienceProfile.seeds.flatMap((e) => e.tags.map((t) => t.name)),
      ),
    ];
    const matchedTags = audienceTags.filter((tag) => words.has(tag));
    const affinityMatches = insights.map((e) => ({
      name: e.name,
      affinity: e.query.affinity,
      matches: e.tags.filter((t) => words.has(t.name)).length / e.tags.length,
    }));
    const affinitySum = affinityMatches.reduce(
      (sum, e) => sum + e.affinity * e.matches,
      0,
    );
    const availableAffinity =
      insights.reduce((sum, e) => sum + e.query.affinity, 0) || 1;
    const affinityPoints = Math.round(
      55 * Math.min(1, (affinitySum / availableAffinity) * 2.2),
    );
    const tagPoints = Math.round(
      35 *
        Math.min(
          1,
          matchedTags.length / Math.max(3, audienceTags.length * 0.45),
        ),
    );
    const coveredSeeds = audienceProfile.seeds.filter((seed) =>
      seed.tags.some((t) => words.has(t.name)),
    );
    const missingSeeds = audienceProfile.seeds.filter(
      (seed) => !coveredSeeds.includes(seed),
    );
    const segmentPenalty =
      missingSeeds.length && coveredSeeds.length
        ? Math.min(15, missingSeeds.length * 4)
        : 0;
    const score = Math.max(
      0,
      Math.min(100, 10 + affinityPoints + tagPoints - segmentPenalty),
    );
    const top = affinityMatches
      .filter((e) => e.matches > 0)
      .sort((a, b) => b.affinity * b.matches - a.affinity * a.matches)[0];
    return {
      score,
      components: {
        baseline: 10,
        affinity: affinityPoints,
        tagOverlap: tagPoints,
        segmentWarning: -segmentPenalty,
        affinitySum: +affinitySum.toFixed(3),
      },
      matchedTags,
      reasons: [
        top
          ? `The concept connects with ${top.name.toLowerCase()}, a strong taste signal in this audience.`
          : "There is little cultural affinity between this concept and the selected tastes.",
        matchedTags.length
          ? `Shared cues: ${matchedTags.slice(0, 5).join(", ")}.`
          : "The description has no shared taste tags. Add concrete details for a more useful comparison.",
        `It connects with ${coveredSeeds.length} of ${audienceProfile.seeds.length} selected taste communities.`,
      ],
      warning: missingSeeds.length
        ? `A weaker fit for fans of ${missingSeeds.map((e) => e.name).join(", ")}. Treat this as a segment trade-off, not a universal preference.`
        : null,
    };
  },
};
export function scoreWithoutQloo(option, seeds, note) {
  const words = tokenize(`${option.title} ${option.description}`);
  const keywords = tokenize(`${seeds.map((e) => e.name).join(" ")} ${note}`);
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "the",
    "of",
    "for",
    "in",
    "who",
    "with",
    "or",
    "to",
    "on",
  ]);
  const meaningful = [...keywords].filter((word) => !stopwords.has(word));
  const overlaps = meaningful.filter((word) => words.has(word));
  const tagOverlap = Math.round(
    (90 * overlaps.length) / Math.max(1, meaningful.length),
  );
  return {
    score: 10 + tagOverlap,
    components: {
      baseline: 10,
      affinity: 0,
      tagOverlap,
      segmentWarning: 0,
      affinitySum: 0,
    },
    matchedTags: overlaps,
    reasons: [
      `${overlaps.length} literal keyword matches in the audience names and note.`,
      overlaps.length
        ? `Matching words: ${overlaps.join(", ")}.`
        : "No exact words overlap.",
      "This baseline ignores cultural relationships and audience segments.",
    ],
    warning: null,
  };
}
