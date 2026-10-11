#!/usr/bin/env bash
# Netlify: 0 = skip; 1 = build. Uncertainty always builds.
set -u
build() { printf '%s\n' "Netlify ignore: build ($1)."; exit 1; }
command -v git >/dev/null 2>&1 || build "git unavailable"
[[ -n "${CACHED_COMMIT_REF:-}" && -n "${COMMIT_REF:-}" ]] || build "missing git refs"
old=$(git rev-parse --verify --end-of-options "${CACHED_COMMIT_REF}^{commit}" 2>/dev/null) || build "cached ref unavailable"
new=$(git rev-parse --verify --end-of-options "${COMMIT_REF}^{commit}" 2>/dev/null) || build "current ref unavailable"
changes=$(mktemp) || build "cannot create diff file"
trap 'rm -f -- "$changes"' EXIT
# Include both sides of renames, including a site file moved into docs/.
git diff --no-ext-diff --no-renames --name-only -z "$old" "$new" -- > "$changes" || build "git diff failed"
scripts_checked=false
while IFS= read -r -d '' file; do
  case "$file" in
    src/*|server/*|public/*|netlify/*|netlify.toml|package.json|scripts/netlify-ignore.sh)
      build "site or build configuration changed" ;;
    package-lock.json|npm-shrinkwrap.json|yarn.lock|pnpm-lock.yaml|bun.lock|bun.lockb|*/package-lock.json|*/npm-shrinkwrap.json|*/yarn.lock|*/pnpm-lock.yaml|*/bun.lock|*/bun.lockb)
      build "lockfile changed" ;;
    scripts/*)
      if [[ "$scripts_checked" == false ]]; then
        # Current build is direct Vite. If a future build/prebuild/postbuild
        # uses scripts, conservatively build for ALL script changes.
        command -v node >/dev/null 2>&1 || build "cannot inspect build scripts"
        node -e 'const fs=require("node:fs"); const s=JSON.parse(fs.readFileSync("package.json","utf8")).scripts; const t=fs.readFileSync("netlify.toml","utf8").split(/^\[build\]\s*$/m)[1]?.split(/^\[/m)[0]; const c=t?.match(/^\s*command\s*=\s*"([^"]*)"\s*$/m)?.[1]; process.exit(s && s.build==="vite build" && !s.prebuild && !s.postbuild && c==="npm run build" ? 0 : 1)' >/dev/null 2>&1 || build "scripts may be used by build"
        # A script imported by site/build code is not a maintenance-only file.
        git grep -q 'scripts/' "$new" -- src server netlify shared index.html 'vite.config.*' 'rollup.config.*' 'webpack.config.*'
        grep_status=$?
        [[ "$grep_status" == 1 ]] || build "site/build code references scripts, or scan failed"
        scripts_checked=true
      fi ;;
    *.md|docs/*|research/*|tests/*|.github/*|LICENSE) ;;
    *) build "unrecognized path changed" ;;
  esac
done < "$changes"
printf '%s\n' 'Netlify ignore: skip (only non-site files changed).'
exit 0
