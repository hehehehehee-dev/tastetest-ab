# TasteTest A/B

Compare two concepts for an audience defined by cultural tastes, make an explainable prediction, then test it with a shareable anonymous poll.

**Mock demo, real Qloo integration, and a three-branch Track B benchmark.** The completed cafe example and its live twin use synthetic taste signals. Quick tests automatically freeze AI-only, Qloo and Agent branches using the configured server-side Replicate and Qloo integrations. Custom ideas use Qloo audience context with an explicitly labeled local text-score fallback. Confirmed catalog items can use direct A/B entity affinity. Neither score is a calibrated vote probability. Quick tests never enter Track B tallies.

## Run locally

Requires Node.js 24 and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. No credentials or environment file are required. The default page is the completed Bloomington cafe example, with a separate always-open live twin for visitors to try. Its collected votes never replace the 52 synthetic example votes. Local polls persist in the ignored `.local/data/` directory. Keep the server running while testing shared links; localhost links are only usable on the same machine.

Optional: copy `.env.example` to `.env` for server-only configuration. Keep `USE_QLOO_MOCK=true` for offline demos. For real Qloo, set `USE_QLOO_MOCK=false`, add your event-issued `QLOO_API_KEY`, and use `QLOO_BASE_URL=https://hackathon.api.qloo.com`. Restart the server. Never put a key in a `VITE_*` variable. Local dev uses the OS certificate store without disabling TLS verification.

## Try the whole flow

1. Explore the sample and switch **Keyword baseline** to compare keyword-only scoring. This toggle is not an AI model.
2. Select **New test**, describe A and B, and select 3–5 taste seeds across the searchable categories.
3. Keep **Custom ideas** for creative descriptions. Qloo audience signals are displayed separately from the local concept-fit fallback; the Agent also receives those signals. For identifiable artists, movies, venues, brands or books, select **Known items in Qloo**, choose their category and explicitly confirm both matches. Check the year or venue address; matching is never automatic.
4. In real mode with both integrations configured, click **Predict & freeze**. Inspect the returned Qloo signals and frozen three-branch receipt, then open the live poll and copy its audience link. Missing direct affinity fails explicitly without substituting a text score. For an offline workflow rehearsal, use **Record as evidence** with clearly synthetic manual records.
5. Open it in a private window, select an option, and watch the owner page update within two seconds.
6. Back in the creating browser, close the test and read or print the final verdict.

Real automatic Quick tests also request a bounded **Taste Analysis** profile: up to five category-specific tags from the same audience seeds. Music uses music genres, Dining uses cuisine, Film/TV and Books use media genres, and Brands uses brand genres. Only the Agent receives this extra context; the AI-only input stays unchanged. Empty or failed profile queries are labeled explicitly and never replaced with invented tags. The profile does not directly score custom designs or predict votes.

**Why these Qloo signals?** shows the normalized per-seed influence supplied by Qloo for each recorded recommendation or candidate. These values are not voting percentages or causal effects. New receipts hash the structured `qlooEvidence` alongside all predictions and the profile. Older receipts are read from their original recorded Agent context without modifying the hash or making new API calls when the disclosure opens.

The public poll UI does not show predictions before voting. New Track B freezes also hide them from unauthenticated API readers until closure. Voters need no account. Only the creating browser has the owner capability needed to close a test. Store that browser's local data if you need to keep owner access.

## Track B benchmark

Open `/benchmark`, then **Create a new case**, or opt into **Record as evidence** on `/create`. Describe both options, select 3–5 audience tastes, and record all three independently obtained original branch answers, their sources/confidences and original timestamp. Choose Track B only for fresh unpublished cases. Record the business, decision, planned poll channel and audience verification, then confirm that no outcome was available before the records. **Prepare evidence case** freezes the records before polling. Owner capability is required for freezing, opening and closing.

The receipt includes the options, audience seeds, three picks/confidences/sources, ISO timestamp, mode and SHA-256. Frozen records cannot be edited by POST, PUT, PATCH or DELETE. Before closure, predictions and pasted answers are private to the owner. Open the poll, share its link, then close to grade all three branches and append one immutable result row. **Copy link** shows a transient **Copied**; **Open poll** uses the same tab.

Evidence mode stores the owner-supplied original AI-only, Qloo and Agent predictions; it does not manufacture independent branch answers from one local score. Quick tests run separate stateless AI-only and Agent calls; only the Agent receives the Qloo context. The Qloo branch uses confirmed direct entity affinity or the declared local fallback. Qloo-branch cards show the recorded affinity gap (or local text-score gap for fallback), plus a TasteTest-calculated separation level. The legacy 40/65/80 field is an app-assigned fit-gap rule retained in receipts for audit, not confidence returned by Qloo. LLM confidence is self-reported; none of these values is calibrated.

The tally shows **not enough cases yet** until 20 eligible closed cases exist. An eligible case needs at least 20 votes, a non-tied outcome, unpublished Track B context, verified audience tastes and non-mock signals. Low-vote cases are **indicative only**, and public/famous cases and mock runs remain excluded even with many votes. Per-branch counts are always visible with denominators, such as `Agent 14/20`; below 20 eligible cases they carry the **not enough cases yet** label. This reporting floor alone does not prove superiority. Per-case confidence/correctness pairs are preserved for later calibration; no calibration claim is made now.

For externally obtained predictions, select **Record as evidence**, enter all three original answers and the original timestamp. The current server freeze timestamp remains distinct from this owner-declared timestamp. No independent verification of externally recorded timing is claimed. If a Qloo-only answer or original timing is missing, keep the case pending; never substitute an AI + Qloo answer for it or rerun predictions as historical evidence. TB-001 is registered publicly as **closed — unverifiable / excluded from evidence** on `/benchmark`, entered on 2026-10-09 with no fabricated seeds, choices or freeze time. The owner confirms the original record cannot be recovered. Keep TB-001 visible only as an excluded administrative note, outside pending cases, recorded-case counts and every Track B tally. Do not rerun any branch, present a rerun as the original prediction, or backdate anything. This status is not a completed experiment or a claim about poll closure. Fresh Track B cases use separate records and freeze predictions before opening a poll. No real outcomes or missing predictions have been invented.

The Track B register includes pending/open cases and a separate excluded-note section, while only closed eligible cases enter its tally. The closed ledger shows context, seeds and distinct server/original timestamps. `/api/benchmark/export.csv` exports closed/open/pending records and explicitly excluded notes, escaping formula-like cells. Displayed branch counts use correct / declared A-or-B picks, with abstentions / eligible cases shown separately. The 20-eligible-case gate is unchanged.

**Automatic Quick tests require server-side `REPLICATE_API_TOKEN` and real Qloo configuration.** They can make paid model calls. Both AI calls must finish successfully before a case is persisted; failed runs do not expose partial predictions or open voting. `.env.example` contains empty credential placeholders. No token reaches the browser or frozen public receipt, and private environment files are never committed.

Receipts use conditional writes in private server storage. Their hash is useful for checking a retained receipt; it is not a signed external timestamp or protection against a server administrator rewriting storage. Votes identify browsers, not verified people. Audience verification and unpublished status are owner declarations, not independently audited facts.

Public datasets live under **workflow rehearsal**, separate from Track B. Cookie Cats commit → reveal behaviour is unchanged. See `BENCHMARK-PROTOCOL-V2.md`, `TRACK-B-CASE-TEMPLATE.md` and `TRACK-B-LEDGER.md` for the supplied protocol and case template.

## MovieLens proxy benchmark

A separate **Proxy benchmark — real preference data** section at /benchmark uses freeze → reveal for historical movie preferences. It never enters Track B totals. New proxy runs use decision policy `always-pick-v1`: Qloo/Agent pick the higher score even with a gap below 10 (labeled low separation); exact ties choose A. Already frozen records retain their original abstention policy. These policies must be disclosed when reporting results. The local proxy flow runs the configured AI automatically when showing results, seals its response and Qloo, then reveals the hidden outcome. Visitors can optionally pick A/B or skip; their guess is recorded separately from AI. No manual model/confidence/rationale fields are required. When automatic AI is unavailable, it is labeled Not run and excluded from the LLM denominator; mock and real-Qloo counts are separate. See [the proxy protocol](PROXY-BENCHMARK.md) for deterministic generation, hidden server-only outcomes, admin-only seeding, dataset-choice constraints and interpretation limits.

## Last.fm music proxy (protocol v2)

Open `/benchmark` → **Proxy — music**, separately from MovieLens and Track B. There are 40 MX cases, one per seed triple. The authorized v2 uses top **20%** of each user's observed artist weights (boundary ties included), ≥30 segment users, ≥20 candidate listeners in the segment, ≥200 candidate listeners overall, and ≥20% relative mean gap. The original top-decile / ≥500 protocol produced no eligible cases in HetRec 2k and is not the music protocol. MovieLens retains its ≥500 rule. Segments may overlap; no independent-case or business-result claim is made. Absent artist records contribute zero observed listens, not evidence of dislike.

Raw data and outcomes stay under ignored `.local/lastfm/`. Fetch with `node --use-system-ca scripts/fetch-lastfm-data.mjs` (or `--archive=PATH` for your ZIP); generate with `node scripts/build-proxy-lastfm-cases.mjs`. Only the input catalog ships. For local freeze → reveal, run `node scripts/seed-music-outcomes.mjs --local`, then `npm run dev`. For Netlify, the same script with `--url=https://YOUR-SITE` uses server-only `PROXY_ADMIN_TOKEN` against `/api/music-proxy/admin/seed`. Automatic AI is available on local dev using the existing server-side provider configuration; production labels AI Not run while retaining real Qloo scoring. Real Music entities use direct candidate affinities when resolved unambiguously; missing/ambiguous entities fail explicitly rather than inventing scores. Qloo and Agent share that predictor, as disclosed.

Source/credit: [Last.fm HetRec 2011, Universidad Autónoma de Madrid, distributed by GroupLens](https://grouplens.org/datasets/hetrec-2011/). Dataset README permits non-commercial use. Music proxy results never merge into film or Track B totals.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The end-to-end tests use installed Microsoft Edge on Windows. On another OS, replace `channel: 'msedge'` in `playwright.config.mjs` with an available Playwright browser and install it with `npx playwright install chromium`. Tests cover desktop and mobile, the complete owner/voter flow, persistence across reloads, live updates, print styling, and horizontal overflow. Generated screenshots are in ignored `artifacts/`.

## Deploy on Netlify

### Deploys cost credits

Each successful published production deploy costs **15 credits** on Netlify's credit-based Free plan (300 credits/month shared with traffic and compute). Batch related changes into one tested commit/push; do not deploy each small tweak. Use **`[skip netlify]`** in WIP, docs or bookkeeping commit messages. Skipped changes ship with the next real deploy. The Git build filter skips non-site-only changes and builds when code changes or checks are uncertain. See [NETLIFY-CREDITS.md](NETLIFY-CREDITS.md) for the October 30 submission and November 2–16 judging checks, limits and environment-change rules.

Connect this public repository to a Netlify site. The included `netlify.toml` sets `npm run build`, `dist`, the API Function, and SPA fallback routes. Netlify automatically supplies the Functions' site context for **Netlify Blobs**. The deployed API uses a site-wide store with strong consistency, so polls survive deployments. No external database or key is required in mock mode.

Alternatively run `npx netlify-cli dev` for Netlify emulation, or `npx netlify-cli deploy --build --prod` after logging in and linking your site. `npm run dev` is the simpler equivalent for local UI/API testing; it uses the local file store. Netlify CLI's function emulator uses its own sandbox Blobs store. Local file polls are not migrated automatically.

The project is deployable; a live deployment requires a Netlify account/site. Production stays in mock mode unless real mode is explicitly enabled. To enable fresh real predictions, add `QLOO_API_KEY`, `USE_QLOO_MOCK=false`, and `QLOO_BASE_URL=https://hackathon.api.qloo.com` to Netlify's server environment (Functions scope), then redeploy. Never upload `.env` as a frontend asset.

## Architecture

### Interface and interaction

The interface uses neutral graphite surfaces, white controls, compact headings, and monospace data labels. The Raycast gradient is reserved for winning score bars, Agent Pick badges and verdicts. Global cursor-follow lighting is disabled. Moving the mouse over the taste network gently moves its wireframe and nodes; keyboard/touch exploration and reduced-motion support remain. Interactive controls have at least 44px tap targets. Decorative elements are excluded from print reports.

App screens start with the two options, Agent Pick and heuristic confidence; the taste network follows as supporting evidence. The cafe sample includes two original SVG poster designs. Images use the same 8:5 geometry in creation previews, predictions, polls and verdicts. Display assets added to an older live demo do not rewrite its stored predictions or votes.

Closed reports have separate **Prediction** and **Verdict** views. The keyword baseline switches the scores, labels and comparison together; actual votes never change. **Share verdict image** downloads a PNG of the verdict card, including its data-source label and calibration caveat. **Print report** produces the same card on one white A4 page. Remote image hosts must permit browser image export; an explicit error offers the print/PDF fallback if export fails.

The benchmark opens with three summary tiles. Open the case register, closed ledger, proxy or workflow-rehearsal drawers for detail; methodology is last. Decision accuracy excludes abstentions, which remain visible in the detailed tally. Synthetic and historical results remain separate from eligible Track B cases.

Real-mode seed search selects exact Qloo entities. Movie search is for titles; a studio query such as A24 offers an explicit switch to Brands without choosing a film on the user's behalf. Dining search returns named venues with address/city metadata when available, so matching names do not imply the same location. A broad preference such as “independent coffee shops” can be added to the audience note, but never becomes an entity ID or counts toward the required 3–5 seeds. Choose a venue only when the audience likes that exact place.

```text
src/                         React UI; no mock fixtures or server secrets
server/fixtures.mjs          Synthetic seeds, affinities, sample input
server/qlooAdapter.mjs       The one server-only Qloo integration boundary
server/api.mjs               Validation, predictions, voting, owner controls
server/storage.mjs           Local files / strongly consistent Netlify Blobs
server/dev.mjs               Single local server with Vite middleware
netlify/functions/api.mjs    Netlify web Request/Response handler
tests/                       API and end-to-end checks
QLOO_UPDATE_LOG.md            Dated integration notes and real-mode follow-up
```

Each vote is a separate entry keyed by test and hashed browser identifier; parallel voters cannot lose votes by overwriting a shared counter. Conditional writes reject duplicate votes. Closing creates an immutable marker, and votes timestamped after closure are excluded. The owner token is returned once, stored in the creating browser, and never embedded in the public poll link; only its SHA-256 hash is persisted server-side.

## Explainable scoring

New Quick-test Qloo receipts use `higher-score-v1`: select the higher score even with a small gap; equal scores abstain because neither is higher. Below 10 points is labeled low separation, 10–24 moderate, and 25+ high; this does not suppress an unequal-score pick. Direct item fit is **100 × the returned candidate affinity**; raw affinities, entity IDs and decision policy are retained in the frozen receipt. Previously frozen abstentions remain unchanged. Separate LLM/Agent choices are model-reported, not replaced by this threshold. These rules are not calibrated probabilities or statistical confidence intervals.

Custom-idea local fit = **10 starting points + 0–55 affinity points + 0–35 shared-tag points − 0–15 segment penalty**, clamped to 0–100. Affinity is weighted by lexical overlap between the concept and recommendation tags. Real mode uses actual Qloo data; mock mode uses synthetic fixtures. The component view shows the raw affinity sum and each contribution. Missing taste communities appear in the warning. This mapping is limited and may produce very low or tied scores for creative descriptions. The naive baseline uses exact word overlap with seed names and the audience note, without relationships or segment analysis.

## Evidence and prospective evaluation

Cookie Cats is a historical case study at `/benchmark-lab/historical-case-01`: reveal observed data directly, with explicit unavailable AI/Qloo predictions. No prediction source, rationale or manual commitment is required. This is excluded from accuracy totals; public answers may be memorized. Mechanism explanations remain labeled illustrative hypotheses.

The prospective study has 25 unpublished taste-based cases planned. Local Git-ignored concept drafts under `research/private/` are unvalidated templates, not prepared benchmark evidence. The [evaluation protocol and CLI](research/README.md) validate real entity resolution and model artifacts, freeze predictions with timestamps/hashes before opening collection, and report AI / Qloo / observed choices with paired statistics and exclusions. No actual predictions or new audience results have been fabricated or collected. Twenty evaluable cases is a reporting floor, not proof of superiority. See the protocol before making Devpost claims. Private drafts are not distributed in the public repository.

## Prototype boundaries

- The one-vote rule identifies a browser, not a person. Clearing storage or using another browser permits another vote. This is deliberately a convenience poll, not abuse-resistant survey infrastructure.
- Results are fetched every two seconds while a poll is open. This is near-real-time polling, not WebSockets.
- No login means owner controls are lost if browser storage is cleared. A poll link alone cannot recover ownership.
- For a high-volume public launch, add rate limits, retention limits, and a transactional database. Blobs enumeration is appropriate for small hackathon polls, not large datasets.
- Real Qloo entity search, metadata and Insights have been verified locally. Production real mode requires private server environment configuration. Hackathon eligibility and prospective model accuracy remain separate checks.
- Recommendation context selects one Insights entity type. Custom descriptions use local concept scoring with a visible fallback label; they are not directly scored as Qloo entities. Known-item Quick tests require two distinct confirmed entity IDs in one category, separate from the audience seeds. Switching creation modes preserves entered options and seeds; Quick tests remain excluded from Track B.
- Requests are serialized at least 650ms apart per server instance, identical requests coalesce, and responses cache for five minutes (at most 200 entries). Rate limits honor Retry-After or use a 30-second cooldown. Errors never silently fall back to mock.

End-to-end tests start an isolated mock server on port 5174 with a separate HMR port; they never load the private key or spend real API quota. `server/qlooClient.mjs` contains the real HTTP transport; `server/qlooAdapter.mjs` selects the mode and applies the local fit heuristic. Private verification captures remain under ignored `.local/`.

The original requested build is preserved in `PROJECT-BRIEF.md`. MIT licensed; see `LICENSE`.

The only active Replicate model is the official `openai/gpt-5` model, configured with the server-only `REPLICATE_API_TOKEN`. Official models are called through Replicate's model endpoint and expose their provider-managed version as `hidden`, so the receipt records the exact requested model name, response ID and returned version disclosure instead of claiming an unattested snapshot. It uses minimal reasoning effort, low verbosity and a 1,200-token completion limit. A larger model does not imply better measured accuracy. A frozen response cannot be replaced silently: start a new run for another prediction. Production enables the AI branch only when the server has `REPLICATE_API_TOKEN`; the token never reaches the client. If Replicate rejects a request, the AI branch is recorded as `Not run`; Qloo can still be frozen and the result revealed. The proxy UI shows AI and Qloo only; the redundant Agent copy remains solely in legacy audit receipts. Track B remains unchanged.
