import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seededRng } from "./build-proxy-cases.mjs";

export const LASTFM_RULES = Object.freeze({
  count: 40,
  minUsers: 30,
  minSegmentListeners: 20,
  minOverallListeners: 200,
  minRelativeGap: 0.2,
  topFraction: 0.2,
});
const digest = (text) => createHash("sha256").update(text).digest("hex");
function tsv(text, header) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  if (lines.shift() !== header) throw Error("Unexpected Last.fm TSV header.");
  return lines.filter(Boolean).map((line) => line.split("\t"));
}
export function parseLastfm(artistText, weightText) {
  const artists = tsv(artistText, "id\tname\turl\tpictureURL").map(
    ([artistId, name, url, pictureURL]) => ({
      artistId,
      name,
      url,
      pictureURL,
    }),
  );
  const listens = tsv(weightText, "userID\tartistID\tweight").map(
    ([userId, artistId, weight]) => ({
      userId,
      artistId,
      weight: Number(weight),
    }),
  );
  return { artists, listens };
}
export function generateLastfmCases(
  artists,
  listens,
  { seed = "tastetest-lastfm-v2", rules = LASTFM_RULES } = {},
) {
  rules = { ...LASTFM_RULES, ...rules };
  if (
    !Number.isInteger(rules.count) ||
    rules.count < 1 ||
    rules.topFraction !== 0.2 ||
    rules.minUsers < 30 ||
    rules.minSegmentListeners < 20 ||
    rules.minOverallListeners < 200 ||
    rules.minRelativeGap < 0.2
  )
    throw Error("Last.fm generator cannot relax the locked eligibility rules.");
  const artistMap = new Map(artists.map((a) => [String(a.artistId), a]));
  if (artistMap.size !== artists.length || artists.some((a) => !a.name?.trim()))
    throw Error("Invalid or duplicate artist metadata.");
  const users = new Map(),
    byArtist = new Map(),
    seen = new Set();
  for (const row of listens) {
    const user = String(row.userId),
      artist = String(row.artistId),
      key = `${user}:${artist}`;
    if (
      !artistMap.has(artist) ||
      !user ||
      !Number.isSafeInteger(row.weight) ||
      row.weight <= 0 ||
      seen.has(key)
    )
      throw Error("Invalid, duplicate or unknown listening record.");
    seen.add(key);
    if (!users.has(user)) users.set(user, []);
    users.get(user).push({ artist, weight: row.weight });
    if (!byArtist.has(artist)) byArtist.set(artist, new Map());
    byArtist.get(artist).set(user, row.weight);
  }
  // Upper 20% by rank within each user's OBSERVED artist records; boundary ties included.
  // Exhaustively enumerate triples: failure is proven, not a random-search timeout.
  const triples = new Map();
  for (const [user, rows] of users) {
    rows.sort(
      (a, b) => b.weight - a.weight || a.artist.localeCompare(b.artist),
    );
    const threshold =
      rows[Math.ceil(rows.length * rules.topFraction) - 1].weight;
    const top = rows
      .filter((r) => r.weight >= threshold)
      .map((r) => r.artist)
      .sort();
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++)
        for (let k = j + 1; k < top.length; k++) {
          const key = JSON.stringify([top[i], top[j], top[k]]);
          if (!triples.has(key)) triples.set(key, []);
          triples.get(key).push(user);
        }
  }
  const popular = [...byArtist]
    .filter(([, u]) => u.size >= rules.minOverallListeners)
    .sort(([a], [b]) => a.localeCompare(b));
  const segments = [...triples]
    .filter(([, u]) => u.length >= rules.minUsers)
    .sort(([a], [b]) => a.localeCompare(b));
  const valid = [];
  for (const [key, segment] of segments) {
    const seeds = JSON.parse(key);
    const candidates = popular
      .filter(([id]) => !seeds.includes(id))
      .map(([artistId, weights]) => {
        const observed = segment.filter((user) => weights.has(user));
        return {
          artistId,
          count: observed.length,
          overallListeners: weights.size,
          mean:
            observed.reduce((sum, user) => sum + weights.get(user), 0) /
            segment.length,
        };
      })
      .filter((c) => c.count >= rules.minSegmentListeners);
    for (let i = 0; i < candidates.length; i++)
      for (let j = i + 1; j < candidates.length; j++) {
        const options = [candidates[i], candidates[j]];
        const relativeGap =
          Math.abs(options[0].mean - options[1].mean) /
          Math.min(options[0].mean, options[1].mean);
        if (relativeGap + 1e-12 >= rules.minRelativeGap)
          valid.push({
            seeds,
            segmentUsers: segment.length,
            options,
            relativeGap,
          });
      }
  }
  const audit = {
    users: users.size,
    listeningRecords: listens.length,
    artists: artists.length,
    popularArtists: popular.map(([id, u]) => ({
      name: artistMap.get(id).name,
      listeners: u.size,
    })),
    eligibleSegments: segments.length,
    maxTopProfileSegment: [...triples.values()].reduce(
      (max, u) => Math.max(max, u.length),
      0,
    ),
    eligibleCases: valid.length,
    rules,
    definitions: {
      topProfile:
        "Upper 20% by rank in each user’s observed listening records, including boundary ties; three seed artists must all qualify.",
      mean: "Mean over every segment user; absent artist records contribute zero observed listens (not evidence of dislike).",
      gap: "abs(meanA-meanB)/min(meanA,meanB)",
      unit: "Implicit listening counts, not explicit ratings or business results",
    },
  };
  const distinctSegments = new Set(valid.map((c) => JSON.stringify(c.seeds)))
    .size;
  if (distinctSegments < rules.count) {
    const error = Error(
      `Cannot generate ${rules.count} music cases: ${valid.length} eligible combinations; maximum top-20% segment ${audit.maxTopProfileSegment}; ${popular.length} artists with >=${rules.minOverallListeners} listeners. No thresholds relaxed, no cases written.`,
    );
    error.audit = audit;
    throw error;
  }
  const rng = seededRng(seed);
  for (let i = valid.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [valid[i], valid[j]] = [valid[j], valid[i]];
  }
  const selected = [];
  const seenSegments = new Set();
  for (const candidate of valid) {
    const key = JSON.stringify(candidate.seeds);
    if (seenSegments.has(key)) continue;
    seenSegments.add(key);
    selected.push(candidate);
    if (selected.length === rules.count) break;
  }
  const cases = [],
    outcomes = [];
  const publicArtist = (id) => ({ artistId: id, name: artistMap.get(id).name });
  for (const candidate of selected) {
    const id = `MX-${String(cases.length + 1).padStart(3, "0")}`;
    const options =
      rng() < 0.5 ? candidate.options : [...candidate.options].reverse();
    cases.push({
      id,
      dataset: "hetrec2011-lastfm-2k",
      seeds: candidate.seeds.map(publicArtist),
      options: options.map((o) => publicArtist(o.artistId)),
    });
    outcomes.push({
      id,
      dataset: "hetrec2011-lastfm-2k",
      segmentUsers: candidate.segmentUsers,
      options,
      relativeGap: candidate.relativeGap,
      actual: options[0].mean > options[1].mean ? "A" : "B",
    });
  }
  const manifest = {
    dataset: "hetrec2011-lastfm-2k",
    domain: "music",
    protocolVersion: "lastfm-proxy-v2",
    selection:
      "One case per seed triple; segments may overlap in users. No independence claim.",
    seed,
    rules,
    definitions: audit.definitions,
    source: "https://grouplens.org/datasets/hetrec-2011/",
    credit:
      "Last.fm; HetRec 2011, Universidad Autónoma de Madrid; distributed by GroupLens",
    label: "Historical preferences, not business results",
  };
  const caseSetHash = digest(JSON.stringify({ manifest, cases }));
  return {
    inputs: { manifest, cases, caseSetHash },
    hidden: { caseSetHash, outcomes },
    audit,
  };
}
async function main() {
  const dir = path.resolve(".local/lastfm");
  const artistText = await readFile(path.join(dir, "artists.dat"), "utf8"),
    weightText = await readFile(path.join(dir, "user_artists.dat"), "utf8");
  const { artists, listens } = parseLastfm(artistText, weightText);
  let result;
  try {
    result = generateLastfmCases(artists, listens);
  } catch (error) {
    if (error.audit)
      await writeFile(
        path.join(dir, "generation-audit.json"),
        JSON.stringify(
          {
            ...error.audit,
            sourceHashes: {
              artists: digest(artistText),
              listens: digest(weightText),
            },
          },
          null,
          2,
        ) + "\n",
      );
    throw error;
  }
  result.inputs.manifest.sourceHashes = {
    artists: digest(artistText),
    listens: digest(weightText),
  };
  result.inputs.caseSetHash = digest(
    JSON.stringify({
      manifest: result.inputs.manifest,
      cases: result.inputs.cases,
    }),
  );
  result.hidden.caseSetHash = result.inputs.caseSetHash;
  await mkdir("server/data", { recursive: true });
  await writeFile(
    "server/data/proxy-lastfm-cases.json",
    JSON.stringify(result.inputs, null, 2) + "\n",
  );
  await writeFile(
    path.join(dir, "proxy-lastfm-outcomes.json"),
    JSON.stringify(result.hidden, null, 2) + "\n",
  );
  await writeFile(
    path.join(dir, "generation-audit.json"),
    JSON.stringify(result.audit, null, 2) + "\n",
  );
  console.log(
    `Generated ${result.inputs.cases.length} music case inputs. Outcomes remain private under .local/lastfm/.`,
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
