// Hand-authored synthetic entities. These IDs and affinities are NOT real Qloo data.
const entry = (id, name, category, tags) => ({
  entity_id: `mock-${id}`,
  name,
  category,
  types: [typeUrns[category]],
  tags: tags.map((value) => ({ name: value, tag_id: `mock-tag-${value}` })),
});
export const typeUrns = {
  Music: "urn:entity:artist",
  "Film/TV": "urn:entity:movie",
  Dining: "urn:entity:place",
  Brands: "urn:entity:brand",
  Books: "urn:entity:book",
};
export const entities = [
  entry("phoebe", "Phoebe Bridgers", "Music", [
    "indie",
    "intimate",
    "nostalgic",
    "creative",
  ]),
  entry("tame", "Tame Impala", "Music", [
    "psychedelic",
    "indie",
    "colorful",
    "creative",
  ]),
  entry("khruangbin", "Khruangbin", "Music", [
    "relaxed",
    "global",
    "vinyl",
    "indie",
  ]),
  entry("taylor", "Taylor Swift", "Music", [
    "pop",
    "community",
    "storytelling",
    "bright",
  ]),
  entry("kendrick", "Kendrick Lamar", "Music", [
    "bold",
    "urban",
    "storytelling",
    "creative",
  ]),
  entry("daft", "Daft Punk", "Music", [
    "electronic",
    "futuristic",
    "bold",
    "dance",
  ]),
  entry("a24", "A24 films", "Film/TV", [
    "indie",
    "artful",
    "intimate",
    "creative",
  ]),
  entry("wes", "Wes Anderson films", "Film/TV", [
    "nostalgic",
    "artful",
    "colorful",
    "playful",
  ]),
  entry("office", "The Office", "Film/TV", [
    "familiar",
    "playful",
    "community",
    "casual",
  ]),
  entry("ghibli", "Studio Ghibli", "Film/TV", [
    "nature",
    "artful",
    "cozy",
    "storytelling",
  ]),
  entry("chef", "Chef's Table", "Film/TV", [
    "craft",
    "food",
    "premium",
    "creative",
  ]),
  entry("cafe", "Independent coffee shops", "Dining", [
    "coffee",
    "indie",
    "local",
    "cozy",
  ]),
  entry("vegan", "Plant-based dining", "Dining", [
    "plant",
    "nature",
    "local",
    "fresh",
  ]),
  entry("street", "Street food", "Dining", [
    "bold",
    "global",
    "casual",
    "food",
  ]),
  entry("bakery", "Artisan bakeries", "Dining", [
    "craft",
    "cozy",
    "nostalgic",
    "food",
  ]),
  entry("patagonia", "Patagonia", "Brands", [
    "nature",
    "craft",
    "local",
    "outdoor",
  ]),
  entry("muji", "MUJI", "Brands", ["minimal", "calm", "craft", "simple"]),
  entry("nike", "Nike", "Brands", ["sport", "bold", "urban", "energy"]),
  entry("levis", "Levi's", "Brands", [
    "vintage",
    "nostalgic",
    "casual",
    "craft",
  ]),
  entry("murakami", "Haruki Murakami", "Books", [
    "intimate",
    "artful",
    "nostalgic",
    "indie",
  ]),
  entry("normal", "Normal People", "Books", [
    "intimate",
    "storytelling",
    "familiar",
    "indie",
  ]),
  entry("dune", "Dune", "Books", [
    "futuristic",
    "bold",
    "global",
    "storytelling",
  ]),
  entry("braiding", "Braiding Sweetgrass", "Books", [
    "nature",
    "local",
    "calm",
    "community",
  ]),
];
export const affinityFixtures = [
  {
    entity_id: "mock-insight-craft",
    name: "Small-batch & handmade",
    tags: ["craft", "local", "artful", "creative"],
    affinity: 0.93,
  },
  {
    entity_id: "mock-insight-slow",
    name: "Slow weekend rituals",
    tags: ["cozy", "coffee", "calm", "intimate", "relaxed"],
    affinity: 0.88,
  },
  {
    entity_id: "mock-insight-retro",
    name: "Analog & nostalgic",
    tags: ["indie", "vinyl", "vintage", "nostalgic"],
    affinity: 0.91,
  },
  {
    entity_id: "mock-insight-bright",
    name: "Big, social moments",
    tags: ["pop", "bright", "community", "playful", "colorful"],
    affinity: 0.86,
  },
  {
    entity_id: "mock-insight-future",
    name: "High-energy discovery",
    tags: ["bold", "futuristic", "electronic", "dance", "energy", "urban"],
    affinity: 0.9,
  },
  {
    entity_id: "mock-insight-nature",
    name: "Grounded & mindful",
    tags: ["nature", "plant", "fresh", "outdoor", "minimal", "simple"],
    affinity: 0.94,
  },
  {
    entity_id: "mock-insight-global",
    name: "Curious & cosmopolitan",
    tags: ["global", "food", "storytelling", "premium", "sport"],
    affinity: 0.82,
  },
];
export const sampleInput = {
  title: "Bloomington indie cafe: which weekend special poster?",
  options: [
    {
      title: "Slow mornings club",
      description:
        "A nostalgic, artful poster for a small-batch coffee and maple pastry special. Warm, intimate, handmade lettering. Vinyl on the turntable, a cozy local weekend ritual.",
      imageUrl: "",
    },
    {
      title: "Weekend, turned up",
      description:
        "A bold, colorful poster for an iced coffee and pastry combo. Bright pop typography, playful energy, and a big weekend offer for the whole community.",
      imageUrl: "",
    },
  ],
  seedEntityIds: ["mock-phoebe", "mock-a24", "mock-cafe", "mock-murakami"],
  audienceNote: "IU students and locals who love independent coffee shops",
};
