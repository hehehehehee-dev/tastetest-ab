# TasteTest A/B

Compare two concepts for an audience defined by cultural tastes, make an explainable prediction, then test it with a shareable anonymous poll.

**Mock demo, real Qloo integration, and optional paired AI comparison.** The completed cafe example and its live twin use synthetic taste signals. Fresh heuristic tests use real entity search, metadata and Insights when server-only real mode is configured. Their scores remain our local tag mapping, not direct Qloo scores for custom posters or calibrated voting probabilities. The separate **AI only vs. AI + Qloo** mode calls the same configured model twice through Replicate or direct OpenAI and locks both choices before voting.

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
3. Choose the recommendation context most relevant to the concepts, then generate a prediction. In real mode, type real entity names to search; mock IDs are rejected. Expand **How this score adds up** and **Real Qloo signals used** to inspect components and provenance.
4. Open the live poll and copy the audience link.
5. Open it in a private window, select an option, and watch the owner page update within two seconds.
6. Back in the creating browser, close the test and read or print the final verdict.

The public poll UI does not show predictions before voting. Paired AI mode also hides them from unauthenticated API readers until closure. Voters need no account. Only the creating browser has the owner capability needed to close a test. Store that browser's local data if you need to keep owner access.

## AI only vs. AI + Qloo

Configure one AI provider in the private server environment, alongside real Qloo. For Replicate, use `AI_PROVIDER=replicate`, `REPLICATE_API_TOKEN`, `REPLICATE_MODEL=openai/gpt-4.1-mini`, and `REPLICATE_VERSION` containing the 64-character adapter version resolved from the model API. This adapter currently supports that model's verified messages/temperature/token schema only. It fixes temperature=0, top_p=1 and max_completion_tokens=700 for both branches. The model is prompted to return JSON; the server validates it, without claiming provider-enforced structured output. For direct OpenAI, use `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` with a Responses-compatible structured-output model. There is no silent provider/model substitution. Restart local dev, or redeploy Netlify after setting variables with Functions scope. Credentials are never accepted from the browser or returned in receipts.

In **New test**, select **AI only vs. AI + Qloo**, then **Lock both AI predictions**. Each attempt makes two paid, independent model calls with the same instructions, requested model, generation settings, text concepts, audience names/categories/note, recommendation context and decision contract. AI only gets no Qloo tags or affinities; AI + Qloo gets resolved seed tags and real recommendation tags, affinities and explainability. Neither receives poll results or the other branch's answer. Images are not evaluated. Recorded model and settings must match. Refusals, incomplete responses, invalid outputs and provider errors create no poll; earlier calls may still have incurred cost. No automatic prediction retries or mock AI fallback are used.

Replicate creation waits up to 10 seconds, then polls only that exact prediction ID within a 45-second per-call deadline. Returned URLs are never followed with credentials. A 45-second provider Cancel-After limit and best-effort cancellation bound unfinished jobs. Official model responses may say `version=hidden`: this is accepted only with the exact requested model name and explicitly recorded in both receipt/UI. The requested adapter version is fixed, but the underlying OpenAI snapshot is not attested when Replicate hides it. An explicit different returned version is rejected. This limitation matters when reporting model-version comparability.

New Replicate jobs are serialized at least 11 seconds apart per server instance to accommodate tighter account limits. A 429 starts a cooldown using Retry-After, or 30 seconds when absent; a queued job that cannot fit its deadline fails without a paid create. This is instance-local pacing, not a global limiter across Netlify instances. Low credit or provider throttling can still reject a comparison, without publishing a partial prediction. See [Replicate rate limits](https://replicate.com/docs/topics/predictions/rate-limits).

The creating browser can inspect and download the receipt, then explicitly **Open live poll**. Until opening, the server rejects votes. Before closure, paired predictions and evidence are withheld from unauthenticated API readers, including the vote response. Opening is idempotent; predictions cannot be edited or rerun on that case. All new attempts must be accounted for rather than selecting only favorable results.

After closure, the report shows **AI only / AI + Qloo / audience choice**, with MATCH, MISS, ABSTAIN, TIED or INSUFFICIENT. The declared per-case threshold is 10 votes and a non-tied poll. This is a workflow threshold, not a power calculation. Confidence is self-reported, not calibrated. Collect 20–30 new cases and report paired results with exclusions; even 20 evaluable cases does not automatically establish superiority. The existing research CLI is a separate protocol; these web receipts do not automatically enter its study ledger.

The receipt stores exact prompts, response IDs, requested/returned model, start/finish/commit timestamps, the 10-vote rule, and SHA-256 of `JSON.stringify(receipt.payload)`; opening/closing times and grades are separate fields. The hash detects changes relative to a retained receipt, but is not a signed external timestamp or proof against a server administrator rewriting history. Preserve the receipt before circulating the poll. Model sampling randomness remains a limitation of one paired call per branch.

Direct OpenAI transport follows [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses); Replicate transport follows its [HTTP API](https://replicate.com/docs/reference/http/) and verified model schema. `server/aiComparison.mjs` owns the two calls and receipt; `server/replicateAi.mjs` handles Replicate; `src/AiComparison.jsx` renders the comparison. Automated tests use clearly synthetic fixtures and spend no provider quota. Integration smoke cases are explicitly labeled and are not prospective accuracy evidence; no prospective audience outcomes have been collected.

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
- Recommendation context selects one Insights entity type. In quick heuristic mode, Qloo grounds a fixed local concept/tag score, not direct entity ranking or an LLM prediction. Paired mode supplies this same recommendation category's real data to the AI + Qloo branch.
- Requests are serialized at least 650ms apart per server instance, identical requests coalesce, and responses cache for five minutes (at most 200 entries). Rate limits honor Retry-After or use a 30-second cooldown. Errors never silently fall back to mock.

End-to-end tests start an isolated mock server on port 5174 with a separate HMR port; they never load the private key or spend real API quota. `server/qlooClient.mjs` contains the real HTTP transport; `server/qlooAdapter.mjs` selects the mode and applies the local fit heuristic. Private verification captures remain under ignored `.local/`.

The original requested build is preserved in `PROJECT-BRIEF.md`. MIT licensed; see `LICENSE`.
