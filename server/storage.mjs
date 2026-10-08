import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

// Local files and production Blobs expose the same API. Votes have separate keys:
// simultaneous voters never overwrite a shared counter.
export function fileStore(directory = path.resolve(".local/data")) {
  let writes = Promise.resolve();
  const filename = (key) =>
    path.join(directory, `${encodeURIComponent(key)}.json`);
  return {
    async get(key) {
      try {
        return JSON.parse(await readFile(filename(key), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async set(key, value, { onlyIfNew = false } = {}) {
      const task = writes.then(async () => {
        await mkdir(directory, { recursive: true });
        if (onlyIfNew) {
          try {
            await writeFile(filename(key), JSON.stringify(value), {
              flag: "wx",
            });
            return true;
          } catch (error) {
            if (error.code === "EEXIST") return false;
            throw error;
          }
        }
        const temp = `${filename(key)}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(value));
        await rename(temp, filename(key));
        return true;
      });
      writes = task.catch(() => {});
      return task;
    },
    async list(prefix) {
      const { readdir } = await import("node:fs/promises");
      try {
        return (await readdir(directory))
          .filter((f) => f.endsWith(".json"))
          .map((f) => decodeURIComponent(f.slice(0, -5)))
          .filter((k) => k.startsWith(prefix));
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    },
  };
}
export function blobStore() {
  const store = getStore({ name: "tastetest-v1", consistency: "strong" });
  return {
    get: (key) => store.get(key, { type: "json" }),
    async set(key, value, options = {}) {
      const result = await store.setJSON(key, value, options);
      return result.modified !== false;
    },
    async list(prefix) {
      const keys = [];
      for await (const page of store.list({ prefix, paginate: true }))
        keys.push(...page.blobs.map((b) => b.key));
      return keys;
    },
  };
}
