import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
const dir = path.resolve(".local/lastfm");
const archive = path.join(dir, "hetrec2011-lastfm-2k.zip");
const source =
  "https://files.grouplens.org/datasets/hetrec2011/hetrec2011-lastfm-2k.zip";
await mkdir(dir, { recursive: true });
const supplied = process.argv
  .find((a) => a.startsWith("--archive="))
  ?.slice(10);
if (supplied) {
  if (path.resolve(supplied) !== archive)
    await copyFile(path.resolve(supplied), archive);
} else {
  const response = await fetch(source, { redirect: "error" });
  if (!response.ok)
    throw Error(`Dataset download failed (${response.status}).`);
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
}
const run = promisify(execFile);
if (process.platform === "win32") {
  const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
  await run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(dir)} -Force`,
  ]);
} else await run("unzip", ["-o", archive, "-d", dir]);
for (const file of ["artists.dat", "user_artists.dat", "readme.txt"])
  await readFile(path.join(dir, file));
const sha256 = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
await writeFile(
  path.join(dir, "ingestion.json"),
  JSON.stringify(
    {
      source,
      sha256,
      importedAt: new Date().toISOString(),
      credit:
        "Last.fm; HetRec 2011, Universidad Autónoma de Madrid; distributed by GroupLens",
      license: "Dataset README: non-commercial use",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Last.fm data extracted privately into .local/lastfm/. Raw data is not a client asset.",
);
