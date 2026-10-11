import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const bash =
  process.platform === "win32"
    ? path.join(
        process.env.ProgramFiles || "C:/Program Files",
        "Git/bin/bash.exe",
      )
    : "bash";
const script = path.resolve("scripts/netlify-ignore.sh");
const root = path.resolve(".local");
fs.mkdirSync(root, { recursive: true });
const dir = fs.mkdtempSync(path.join(root, "netlify-ignore-test-"));
function git(...args) {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function write(file, text = "fixture\n") {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}
function commit() {
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  return git("rev-parse", "HEAD");
}
function run(old, current, extra = {}) {
  return spawnSync(bash, [script.replaceAll("\\", "/")], {
    cwd: dir,
    env: {
      ...process.env,
      CACHED_COMMIT_REF: old,
      COMMIT_REF: current,
      ...extra,
    },
    encoding: "utf8",
  });
}
test("Netlify ignore skips only non-site changes and fails open for code, renames, invalid refs and build scripts", () => {
  try {
    git("init", "-q");
    write("package.json", JSON.stringify({ scripts: { build: "vite build" } }));
    write("netlify.toml", '[build]\n  command = "npm run build"\n');
    write("src/main.js");
    const base = commit();
    for (const file of [
      "README.md",
      "docs/guide.txt",
      "research/data.json",
      "tests/spec.mjs",
      ".github/workflows/ci.yml",
      "LICENSE",
      "scripts/maintenance.mjs",
      process.platform === "win32"
        ? "docs/name with spaces.md"
        : "docs/name with\nnewline.md",
    ])
      write(file);
    const docs = commit();
    assert.equal(run(base, docs).status, 0);
    assert.equal(run(docs, docs).status, 0);
    for (const file of [
      "src/main.js",
      "src/note.md",
      "server/api.mjs",
      "public/logo.svg",
      "netlify/functions/api.mjs",
      "netlify.toml",
      "package.json",
      "package-lock.json",
      "scripts/netlify-ignore.sh",
      "shared/confidence.mjs",
      "index.html",
      "unknown.config",
    ]) {
      const old = git("rev-parse", "HEAD");
      write(
        file,
        file === "package.json"
          ? JSON.stringify({ scripts: { build: "vite build" } }) + "\n"
          : "changed " + file + "\n",
      );
      const current = commit();
      assert.equal(run(old, current).status, 1, file);
    }
    assert.equal(run("", docs).status, 1);
    assert.equal(run(docs, "").status, 1);
    assert.equal(run("not-a-ref", docs).status, 1);
    assert.equal(run(docs, "not-a-ref").status, 1);
    assert.equal(run(base, docs, { PATH: "" }).status, 1, "missing git");
    const beforeRename = git("rev-parse", "HEAD");
    git("mv", "src/main.js", "docs/moved.js");
    const renamed = commit();
    assert.equal(run(beforeRename, renamed).status, 1, "site-to-docs rename");
    // Earlier undeployed code cannot disappear behind the latest docs-only commit.
    write("docs/later.md");
    const later = commit();
    assert.equal(run(beforeRename, later).status, 1);
    write(
      "package.json",
      JSON.stringify({ scripts: { build: "node scripts/build.mjs" } }),
    );
    write("netlify.toml", '[build]\n  command = "npm run build"\n');
    const custom = commit();
    write("scripts/build.mjs");
    const built = commit();
    assert.equal(run(custom, built).status, 1);
    write(
      "package.json",
      JSON.stringify({
        scripts: { build: "vite build", prebuild: "node scripts/prepare.mjs" },
      }),
    );
    const pre = commit();
    write("scripts/prepare.mjs");
    const prepared = commit();
    assert.equal(run(pre, prepared).status, 1);
    write("package.json", JSON.stringify({ scripts: { build: "vite build" } }));
    write("netlify.toml", '[build]\n  command = "node scripts/build.mjs"\n');
    const config = commit();
    write("scripts/build.mjs", "new build");
    const configured = commit();
    assert.equal(run(config, configured).status, 1);
    write("netlify.toml", '[build]\n  command = "npm run build"\n');
    write("server/api.mjs", 'import "../scripts/runtime.mjs";');
    const imported = commit();
    write("scripts/runtime.mjs");
    const runtime = commit();
    assert.equal(run(imported, runtime).status, 1);
  } finally {
    // Only remove the exact freshly created fixture inside the ignored workspace directory.
    assert.ok(path.resolve(dir).startsWith(root + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
