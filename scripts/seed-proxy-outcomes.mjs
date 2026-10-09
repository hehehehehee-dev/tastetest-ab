import { readFile } from "node:fs/promises";
const base =
  process.argv.find((arg) => arg.startsWith("--url="))?.slice(6) ||
  "http://localhost:5173";
const url = new URL(base);
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw Error("Use HTTPS for a remote admin upload.");
const token = process.env.PROXY_ADMIN_TOKEN;
if (!token || token.length < 32)
  throw Error(
    "Set the private PROXY_ADMIN_TOKEN on the server and in this process before seeding.",
  );
const body = await readFile(".local/proxy-data/proxy-outcomes.json", "utf8");
const response = await fetch(new URL("/api/proxy/admin/seed", url), {
  method: "POST",
  redirect: "error",
  headers: { "Content-Type": "application/json", "X-Proxy-Admin-Token": token },
  body,
});
if (!response.ok)
  throw Error(
    `Admin seeding failed (${response.status}); no credential or outcomes printed.`,
  );
const result = await response.json();
console.log(
  `Private outcomes seeded for ${result.seeded} cases; created=${result.created}.`,
);
