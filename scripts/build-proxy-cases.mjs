import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_RULES = Object.freeze({
  count: 40,
  minUsers: 30,
  minSegmentRatings: 20,
  minOverallRatings: 500,
  minGap: 0.3,
  maxPopularityRatio: 1.5,
  seedRating: 4,
});
export function csvRows(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(value.replace(/\r$/, ""));
      value = "";
      if (c === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else value += c;
  }
  if (quoted) throw Error("Unterminated CSV quote.");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}
export function seededRng(seed) {
  let state = createHash("sha256")
    .update(String(seed))
    .digest()
    .readUInt32LE(0);
  return () => {
    state += 0x6d2b79f5;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const digest = (text) => createHash("sha256").update(text).digest("hex");
const publicMovie = (movie) => ({
  movieId: movie.movieId,
  title: movie.title.replace(/\s*\(\d{4}\)\s*$/, ""),
  year: Number(movie.title.match(/\((\d{4})\)\s*$/)?.[1]) || null,
  genres: movie.genres,
});
export function generateProxyCases(
  movies,
  ratings,
  {
    seed = "tastetest-proxy-v1",
    rules = DEFAULT_RULES,
    dataset = "ml-1m",
    maxAttempts = 30000,
  } = {},
) {
  rules = { ...DEFAULT_RULES, ...rules };
  const rng = seededRng(seed);
  const index = new Map(
    movies.map((movie) => [
      String(movie.movieId),
      {
        ...movie,
        movieId: String(movie.movieId),
        ratings: new Map(),
        fans: new Set(),
      },
    ]),
  );
  for (const rating of ratings) {
    const movie = index.get(String(rating.movieId));
    if (!movie) continue;
    const user = String(rating.userId),
      value = Number(rating.rating);
    if (!Number.isFinite(value) || value < 0.5 || value > 5)
      throw Error("Invalid movie rating.");
    if (movie.ratings.has(user)) throw Error("Duplicate user/movie rating.");
    movie.ratings.set(user, value);
    if (value >= rules.seedRating) movie.fans.add(user);
  }
  const popular = [...index.values()]
    .filter((m) => m.ratings.size >= rules.minOverallRatings)
    .sort(
      (a, b) =>
        b.ratings.size - a.ratings.size ||
        Number(a.movieId) - Number(b.movieId),
    );
  if (popular.length < 5)
    throw Error(
      `Cannot generate cases: only ${popular.length} movies meet >=${rules.minOverallRatings} overall ratings (maximum ${Math.max(0, ...[...index.values()].map((m) => m.ratings.size))}). Change dataset or explicitly revise the threshold.`,
    );
  const genres = [...new Set(popular.flatMap((m) => m.genres))]
    .filter((g) => g !== "(no genres listed)")
    .sort();
  const groups = genres
    .map((genre) => ({
      genre,
      movies: popular.filter((m) => m.genres.includes(genre)).slice(0, 60),
    }))
    .filter((g) => g.movies.length >= 3);
  const cases = [],
    outcomes = [],
    seenSeeds = new Set(),
    seenPairs = new Set();
  for (
    let attempt = 0;
    attempt < maxAttempts && cases.length < rules.count;
    attempt++
  ) {
    const group = groups[Math.floor(rng() * groups.length)];
    if (!group) break;
    const pool = [...group.movies],
      seeds = [];
    for (let i = 0; i < 3; i++)
      seeds.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    seeds.sort((a, b) => Number(a.movieId) - Number(b.movieId));
    const seedKey = seeds.map((m) => m.movieId).join(",");
    if (seenSeeds.has(seedKey)) continue;
    if (
      seeds.some((a, i) =>
        seeds
          .slice(i + 1)
          .some(
            (b) =>
              a.genres.filter((g) => b.genres.includes(g)).length /
                new Set([...a.genres, ...b.genres]).size <
              0.25,
          ),
      )
    )
      continue;
    const audience = [...seeds[0].fans].filter((user) =>
      seeds.every((m) => m.fans.has(user)),
    );
    if (audience.length < rules.minUsers) continue;
    const candidates = popular
      .filter((m) => !seeds.includes(m))
      .map((movie) => {
        const observed = audience
          .map((user) => movie.ratings.get(user))
          .filter((value) => value !== undefined);
        return {
          movie,
          count: observed.length,
          mean:
            observed.reduce((sum, value) => sum + value, 0) / observed.length,
        };
      })
      .filter((c) => c.count >= rules.minSegmentRatings);
    const pairs = [];
    for (let a = 0; a < candidates.length; a++)
      for (let b = a + 1; b < candidates.length; b++) {
        const x = candidates[a],
          y = candidates[b];
        const key = [x.movie.movieId, y.movie.movieId]
          .sort((a, b) => Number(a) - Number(b))
          .join(",");
        const ratio =
          Math.max(x.movie.ratings.size, y.movie.ratings.size) /
          Math.min(x.movie.ratings.size, y.movie.ratings.size);
        if (
          !seenPairs.has(key) &&
          ratio <= rules.maxPopularityRatio &&
          Math.abs(x.mean - y.mean) + 1e-12 >= rules.minGap &&
          x.movie.genres.some((g) => y.movie.genres.includes(g))
        )
          pairs.push({ x, y, key, ratio });
      }
    if (!pairs.length) continue;
    pairs.sort((a, b) => a.ratio - b.ratio || a.key.localeCompare(b.key));
    const chosen = pairs[Math.floor(rng() * Math.min(20, pairs.length))];
    const options = rng() < 0.5 ? [chosen.x, chosen.y] : [chosen.y, chosen.x];
    const id = `PX-${String(cases.length + 1).padStart(3, "0")}`;
    cases.push({
      id,
      dataset,
      seeds: seeds.map(publicMovie),
      options: options.map((c) => publicMovie(c.movie)),
      audienceDefinition: `Users who rated all three ${group.genre} seeds at least ${rules.seedRating.toFixed(1)} stars.`,
    });
    outcomes.push({
      id,
      dataset,
      segmentUsers: audience.length,
      actual: options[0].mean > options[1].mean ? "A" : "B",
      gap: Math.abs(options[0].mean - options[1].mean),
      options: options.map((c) => ({
        movieId: c.movie.movieId,
        count: c.count,
        mean: c.mean,
        overallRatings: c.movie.ratings.size,
      })),
    });
    seenSeeds.add(seedKey);
    seenPairs.add(chosen.key);
  }
  if (cases.length !== rules.count)
    throw Error(
      `Only ${cases.length}/${rules.count} valid cases found. No thresholds were weakened.`,
    );
  const manifest = {
    schemaVersion: 1,
    dataset,
    seed,
    rules,
    source: "https://grouplens.org/datasets/movielens/",
    selection:
      "Distinct seed triples, common genre and pairwise genre Jaccard >=0.25; similarly popular candidate pairs share a genre. Outcomes select cases with >=0.3 mean-rating gap, so this is a filtered retrospective proxy, not a prospective accuracy study.",
  };
  const caseSetHash = digest(JSON.stringify({ manifest, cases }));
  return {
    inputs: { manifest, caseSetHash, cases },
    hidden: { schemaVersion: 1, caseSetHash, outcomes },
  };
}
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const i = arg.indexOf("=");
      if (i < 0) throw Error("Use --name=value arguments.");
      return [arg.slice(2, i), arg.slice(i + 1)];
    }),
  );
  const dataset = args.dataset || "ml-1m";
  const dir = args.data || `.local/proxy-data/${dataset}`;
  const dat = dataset === "ml-1m";
  const movieText = await readFile(
    path.join(dir, dat ? "movies.dat" : "movies.csv"),
    dat ? "latin1" : "utf8",
  );
  const ratingText = await readFile(
    path.join(dir, dat ? "ratings.dat" : "ratings.csv"),
    "utf8",
  );
  const movies = (
    dat
      ? movieText
          .trim()
          .split(/\r?\n/)
          .map((line) => line.split("::"))
      : csvRows(movieText).slice(1)
  ).map(([movieId, title, genres]) => ({
    movieId,
    title,
    genres: genres.split("|"),
  }));
  const ratings = (
    dat
      ? ratingText
          .trim()
          .split(/\r?\n/)
          .map((line) => line.split("::"))
      : csvRows(ratingText).slice(1)
  ).map(([userId, movieId, rating]) => ({
    userId,
    movieId,
    rating: Number(rating),
  }));
  const rules = {
    ...DEFAULT_RULES,
    ...(args["min-overall"]
      ? { minOverallRatings: Number(args["min-overall"]) }
      : {}),
  };
  const result = generateProxyCases(movies, ratings, {
    seed: args.seed || "tastetest-proxy-v1",
    dataset,
    rules,
  });
  result.inputs.manifest.sourceHashes = {
    movies: digest(movieText),
    ratings: digest(ratingText),
  };
  result.inputs.caseSetHash = digest(
    JSON.stringify({
      manifest: result.inputs.manifest,
      cases: result.inputs.cases,
    }),
  );
  result.hidden.caseSetHash = result.inputs.caseSetHash;
  await mkdir("server/data", { recursive: true });
  await mkdir(".local/proxy-data", { recursive: true });
  await writeFile(
    "server/data/proxy-cases.json",
    JSON.stringify(result.inputs, null, 2) + "\n",
  );
  await writeFile(
    ".local/proxy-data/proxy-outcomes.json",
    JSON.stringify(result.hidden, null, 2) + "\n",
  );
  console.log(
    `Generated ${result.inputs.cases.length} cases; inputs contain no outcomes. Private outcomes saved under .local/proxy-data/.`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
