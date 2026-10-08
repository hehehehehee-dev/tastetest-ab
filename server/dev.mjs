import http from "node:http";
import { createServer } from "vite";
import { createApi } from "./api.mjs";
import { fileStore } from "./storage.mjs";
const port = Number(process.env.PORT || 5173);
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
});
const api = createApi(fileStore());
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/api/")) return vite.middlewares(req, res);
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 16000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "This request is too large." }));
      }
      chunks.push(chunk);
    }
    const request = new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: req.headers,
      ...(req.method !== "GET" && req.method !== "HEAD"
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    const result = await api(request);
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text());
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Server error");
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`TasteTest A/B ready at http://localhost:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await vite.close();
    server.close();
    process.exit(0);
  });
