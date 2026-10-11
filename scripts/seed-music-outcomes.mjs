import { readFile } from "node:fs/promises";
import catalog from "../server/data/proxy-lastfm-cases.json" with { type: "json" };
import { musicStore, validateMusicOutcomes } from "../server/musicProxy.mjs";
import { fileStore } from "../server/storage.mjs";
import { seedProxyOutcomes } from "../server/proxy.mjs";
const body = JSON.parse(
  await readFile(".local/lastfm/proxy-lastfm-outcomes.json", "utf8"),
);
if (process.argv.includes("--local")) {
  await seedProxyOutcomes(
    musicStore(fileStore()),
    catalog,
    body,
    validateMusicOutcomes,
  );
  console.log("Private music outcomes seeded into local server storage.");
} else {
  const base = new URL(
    process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
      "http://localhost:5173",
  );
  if (
    base.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(base.hostname)
  )
    throw Error("Use HTTPS for remote seeding.");
  const token = process.env.PROXY_ADMIN_TOKEN;
  if (!token || token.length < 32)
    throw Error("Server-side PROXY_ADMIN_TOKEN required.");
  const response = await fetch(new URL("/api/music-proxy/admin/seed", base), {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Admin-Token": token,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw Error(`Music admin seeding failed (${response.status}).`);
  console.log(
    "Private music outcomes seeded; no credential or outcome values printed.",
  );
}
