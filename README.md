# TasteTest A/B

Compare two concepts for an audience defined by cultural tastes, make an explainable prediction, then test it with a shareable anonymous poll.

**Mock-first prototype.** All taste entities, affinities, and sample votes are synthetic. The app makes no Qloo or LLM API calls. Cultural-fit scores are heuristic points, not voting probabilities or calibrated business forecasts.

## Run locally

Requires Node.js 24 (or Node.js 22.12+) and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. No credentials or environment file are required. The default page is the completed Bloomington cafe example. Local polls persist in the ignored `.local/data/` directory. Keep the server running while testing shared links; localhost links are only usable on the same machine.

Optional: copy `.env.example` to `.env`. Leave `USE_QLOO_MOCK=true`. Setting it to `false` returns a clear error, because real mode is intentionally not implemented. Never put a key in a `VITE_*` variable.

## Try the whole flow

1. Explore the sample and switch **Without Qloo** to compare keyword-only scoring.
2. Select **New test**, describe A and B, and select 3–5 taste seeds across the searchable categories.
3. Generate a prediction. Expand **How this score adds up** to inspect its components.
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

The project is deployable; a live deployment requires a Netlify account/site. Keep mock mode enabled until real integration is ready.

## Architecture

### Interface and interaction

The updated taste-lab interface uses graphite surfaces, lime controls, Space Grotesk headings, and monospace data labels. A mouse spotlight and restrained card tilt respond directly to pointer movement. Moving the mouse anywhere across the taste network makes the nodes gently repel, tilts and separates the central wireframe layers, and lights up the connecting signals; no press or click is required. Spring motion returns the network to rest on exit. The network uses the selected audience seeds: hover or focus a node to see its cues, click to select it, or optionally drag it to rearrange the diagram. On touch devices the nodes remain tappable and page scrolling stays native. Reduced-motion preferences disable ambient pointer effects and animated transforms. The network and decorative lighting are excluded from print reports.

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

Mock fit = **10 starting points + 0–55 affinity points + 0–35 shared-tag points − 0–15 segment penalty**, clamped to 0–100. Affinity is weighted by the concept's matching cultural cues. The component view shows the raw affinity sum and each contribution. Missing taste communities appear in the warning. The naive baseline uses exact word overlap with seed names and the audience note, without relationships or segment analysis.

## Evidence and prospective evaluation

Cookie Cats is now a separate [historical workflow rehearsal](research/README.md), accessible at `/case-study/cookie-cats`: commit an answer before revealing observed retention, then download the server-timestamped receipt. It is not a benchmark proving ordinary AI is wrong or Qloo is better. Public results may be memorized; the CSV contains no AI predictions. Mechanism explanations are explicitly labeled **illustrative hypotheses**.

A private, Git-ignored pack of 25 taste-based case drafts is prepared locally under `research/private/`. The [evaluation protocol and CLI](research/README.md) validate real entity resolution and model artifacts, freeze predictions with timestamps/hashes before opening collection, and report AI / Qloo / observed choices with paired statistics and exclusions. No actual predictions or new audience results have been fabricated or collected. Twenty evaluable cases is a reporting floor, not proof of superiority. See the protocol before making Devpost claims. Private drafts are not distributed in the public repository.

## Prototype boundaries

- The one-vote rule identifies a browser, not a person. Clearing storage or using another browser permits another vote. This is deliberately a convenience poll, not abuse-resistant survey infrastructure.
- Results are fetched every two seconds while a poll is open. This is near-real-time polling, not WebSockets.
- No login means owner controls are lost if browser storage is cleared. A poll link alone cannot recover ownership.
- For a high-volume public launch, add rate limits, retention limits, and a transactional database. Blobs enumeration is appropriate for small hackathon polls, not large datasets.
- Real Qloo integration and hackathon eligibility still require verification; the mock build alone does not demonstrate real Qloo use.

The original requested build is preserved in `PROJECT-BRIEF.md`. MIT licensed; see `LICENSE`.
