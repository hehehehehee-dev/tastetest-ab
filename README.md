# TasteTest A/B

Compare two concepts for an audience defined by cultural tastes, make an explainable prediction, then test it with a shareable anonymous poll.

**Mock demo + optional real Qloo integration.** The completed cafe example and its live twin use synthetic taste signals. Fresh tests use real entity search, metadata and Insights when server-only real mode is configured. Scores remain our heuristic mapping of concept text to cultural tags, not direct Qloo scores for custom posters or calibrated voting probabilities. No LLM is called.

## Run locally

Requires Node.js 24 and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. No credentials or environment file are required. The default page is the completed Bloomington cafe example, with a separate always-open live twin for visitors to try. Its collected votes never replace the 52 synthetic example votes. Local polls persist in the ignored `.local/data/` directory. Keep the server running while testing shared links; localhost links are only usable on the same machine.

Optional: copy `.env.example` to `.env` for server-only configuration. Keep `USE_QLOO_MOCK=true` for offline demos. For real Qloo, set `USE_QLOO_MOCK=false`, add your event-issued `QLOO_API_KEY`, and use `QLOO_BASE_URL=https://hackathon.api.qloo.com`. Restart the server. Never put a key in a `VITE_*` variable. Local dev uses the OS certificate store without disabling TLS verification.

## Try the whole flow

1. Explore the sample and switch **Without Qloo** to compare keyword-only scoring.
2. Select **New test**, describe A and B, and select 3–5 taste seeds across the searchable categories.
3. Choose the recommendation context most relevant to the concepts, then generate a prediction. In real mode, type real entity names to search; mock IDs are rejected. Expand **How this score adds up** and **Real Qloo signals used** to inspect components and provenance.
4. Open the live poll and copy the audience link.
5. Open it in a private window, select an option, and watch the owner page update within two seconds.
6. Back in the creating browser, close the test and read or print the final verdict.

The public poll does not reveal agent predictions before voting, avoiding that source of bias. Voters need no account. Only the creating browser has the owner capability needed to close a test. Store that browser's local data if you need to keep owner access.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The end-to-end tests use installed Microsoft Edge on Windows. On another OS, replace `channel: 'msedge'` in `playwright.config.mjs` with an available Playwright browser and install it with `npx playwright install chromium`. Tests cover desktop and mobile, the complete owner/voter flow, persistence across reloads, live updates, print styling, and horizontal overflow. Generated screenshots are in ignored `artifacts/`.

## Deploy on Netlify

Connect this public repository to a Netlify site. The included `netlify.toml` sets `npm run build`, `dist`, the API Function, and SPA fallback routes. Netlify automatically supplies the Functions' site context for **Netlify Blobs**. The deployed API uses a site-wide store with strong consistency, so polls survive deployments. No external database or key is required in mock mode.

Alternatively run `npx netlify-cli dev` for Netlify emulation, or `npx netlify-cli deploy --build --prod` after logging in and linking your site. `npm run dev` is the simpler equivalent for local UI/API testing; it uses the local file store. Netlify CLI's function emulator uses its own sandbox Blobs store. Local file polls are not migrated automatically.

The project is deployable; a live deployment requires a Netlify account/site. Production stays in mock mode unless real mode is explicitly enabled. To enable fresh real predictions, add `QLOO_API_KEY`, `USE_QLOO_MOCK=false`, and `QLOO_BASE_URL=https://hackathon.api.qloo.com` to Netlify's server environment (Functions scope), then redeploy. Never upload `.env` as a frontend asset.

## Architecture

### Interface and interaction

The interface uses neutral graphite surfaces, white controls, compact headings, and monospace data labels. The Raycast gradient is reserved for winning score bars, Agent Pick badges and verdicts. Global cursor-follow lighting is disabled. Moving the mouse over the taste network gently moves its wireframe and nodes; keyboard/touch exploration and reduced-motion support remain. Interactive controls have at least 44px tap targets. Decorative elements are excluded from print reports.

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

Heuristic confidence uses the absolute fit score gap in both modes: below 10 points = low / too close to call (no Agent Pick), 10–24 = moderate, 25+ = high. The affinity contribution gap is shown separately. These thresholds are declared design rules, not calibrated probabilities or statistical confidence intervals. The keyword baseline uses the same separation rule.

Local fit = **10 starting points + 0–55 affinity points + 0–35 shared-tag points − 0–15 segment penalty**, clamped to 0–100. Affinity is weighted by lexical overlap between the concept and recommendation tags. Real mode uses actual Qloo data; mock mode uses synthetic fixtures. The component view shows the raw affinity sum and each contribution. Missing taste communities appear in the warning. This mapping is limited and may produce very low or tied scores for creative descriptions. The naive baseline uses exact word overlap with seed names and the audience note, without relationships or segment analysis.

## Evidence and prospective evaluation

Cookie Cats is now a separate [historical workflow rehearsal](research/README.md), accessible through the footer at `/benchmark-lab/historical-case-01`: select a card, source, exact model/version, confidence and rationale; commit to lock on the server; then explicitly reveal and score. The locked receipt survives reloads in the original browser and can be downloaded. The commit response contains no observed result. The legacy `/case-study/cookie-cats` link still works. It is not a benchmark proving ordinary AI is wrong or Qloo is better. Public results may be memorized; the CSV contains no AI predictions. Mechanism explanations are explicitly labeled **illustrative hypotheses**.

The prospective study has 25 unpublished taste-based cases planned. Local Git-ignored concept drafts under `research/private/` are unvalidated templates, not prepared benchmark evidence. The [evaluation protocol and CLI](research/README.md) validate real entity resolution and model artifacts, freeze predictions with timestamps/hashes before opening collection, and report AI / Qloo / observed choices with paired statistics and exclusions. No actual predictions or new audience results have been fabricated or collected. Twenty evaluable cases is a reporting floor, not proof of superiority. See the protocol before making Devpost claims. Private drafts are not distributed in the public repository.

## Prototype boundaries

- The one-vote rule identifies a browser, not a person. Clearing storage or using another browser permits another vote. This is deliberately a convenience poll, not abuse-resistant survey infrastructure.
- Results are fetched every two seconds while a poll is open. This is near-real-time polling, not WebSockets.
- No login means owner controls are lost if browser storage is cleared. A poll link alone cannot recover ownership.
- For a high-volume public launch, add rate limits, retention limits, and a transactional database. Blobs enumeration is appropriate for small hackathon polls, not large datasets.
- Real Qloo entity search, metadata and Insights have been verified locally. Production real mode requires private server environment configuration. Hackathon eligibility and prospective model accuracy remain separate checks.
- Recommendation context selects one Insights entity type. Qloo grounds a fixed local concept/tag heuristic; this is not direct entity ranking for the two custom concepts and is not an LLM prediction.
- Requests are serialized at least 650ms apart per server instance, identical requests coalesce, and responses cache for five minutes (at most 200 entries). Rate limits honor Retry-After or use a 30-second cooldown. Errors never silently fall back to mock.

End-to-end tests start an isolated mock server on port 5174 with a separate HMR port; they never load the private key or spend real API quota. `server/qlooClient.mjs` contains the real HTTP transport; `server/qlooAdapter.mjs` selects the mode and applies the local fit heuristic. Private verification captures remain under ignored `.local/`.

The original requested build is preserved in `PROJECT-BRIEF.md`. MIT licensed; see `LICENSE`.
