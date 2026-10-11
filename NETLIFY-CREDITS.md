# Netlify credits runbook

For TasteTest's **credit-based Free plan**. Documentation checked 2026-10-11; use dashboard Usage for the actual balance and billing-cycle reset date.

- **300 credits/month**, hard limit, no automatic paid recharge. Each successful published production deploy costs **15 credits**. Requests, bandwidth and function compute share this team/account pool; 20 deploys would exhaust it even before traffic.
- At exhaustion, **all account/team sites pause** until the next cycle or an upgrade. Warnings include **50%, 75%, 100%**; the billing FAQ also lists 90%. Act before exhaustion.
- Batch related changes, validate locally, then make **one commit/push**. Never production-deploy after each small tweak. Local tests/builds consume no Netlify deployment credits.

Sources: [credit accounting](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), [billing FAQ](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/), [pricing](https://www.netlify.com/pricing/).

## Skip unnecessary deploys

`netlify.toml` runs executable `./scripts/netlify-ignore.sh`. Exit **0 skips** a Git-triggered build when the diff from `CACHED_COMMIT_REF` to `COMMIT_REF` contains only Markdown, `docs/`, `research/`, maintenance `scripts/`, `tests/`, `.github/` or `LICENSE`. Site paths take precedence, even for Markdown. Unknown paths, missing/invalid refs, unavailable Git and failed checks return **1 to build**. Renames and deletions are checked too.

Site code, dependencies, lockfiles, Netlify configuration and the ignore script itself build normally. If build/prebuild/postbuild changes from the current direct `vite build`, all script changes conservatively build until the filter is reviewed. Keep the script executable (`100755`) with LF line endings.

For deliberate WIP/docs/bookkeeping commits:

```text
Document benchmark protocol [skip netlify]
```

`[skip netlify deploy]` and `[skip ci]` are supported alternatives. These markers are explicit overrides; do not use them on a release that must ship. **Skipped deploys do not auto-retry**. Changes remain in Git and ship with the next real production deploy. The diff against the cached deployment also catches earlier undeployed code, even if the latest commit only edits docs.

Build hooks bypass the custom ignore command; manual/CLI deploys are not protected by this Git filter. Batch those too. Dashboard **environment-variable changes take effect on the next deploy**. An environment-only release needs an intentional real deployment; a docs-only push may be skipped.

Sources: [ignore builds](https://docs.netlify.com/build/configure-builds/ignore-builds/), [commit skip markers](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/), [environment changes](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/).

## Submission and judging buffer

1. **Before October 30, 2026 (submission):** check dashboard Usage, remaining credits, reset date and consumption across all account sites. Batch the final release; budget its 15 credits plus traffic/compute.
2. **Before November 2, 2026 (judging starts):** recheck Usage and confirm production works. Preserve a credit buffer through **November 16**, including judging traffic and necessary fixes. Defer cosmetic deploys.
3. At a warning, review remaining balance and defer nonessential releases. Skipping deploys does not stop ongoing traffic consumption.

These are manual checkpoints, not scheduled reminders. No API keys or environment values belong in this document.
