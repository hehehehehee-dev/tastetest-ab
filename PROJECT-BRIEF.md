# TasteTest A/B — Codex build prompt (mock-first, start before Qloo key arrives)

Paste this into Codex in an empty project folder. Goal: build everything that does NOT depend on the real Qloo API now, behind a swappable adapter, so the day the key arrives only the adapter changes.

---

Build "TasteTest A/B", a web app where a small business owner or creator decides between two options (e.g., two menu specials, two poster concepts, two product names, two event themes) for a target audience defined by cultural tastes.

Core flow (3 screens only, no login, no dashboard):
1. **Create a test** — two large option cards (title + optional image URL + short description each) and a target-audience picker: the owner selects 3–5 taste seeds from searchable chips grouped by Music, Film/TV, Dining, Brands, Books. Also a free-text audience note (e.g., "IU students near campus").
2. **Agent prediction** — the app scores Option A vs Option B for that audience and shows: big score bars (0–100), predicted winner, 2–3 plain-language reasons per option, and any audience-segment trade-off warning. A "Without Qloo" toggle re-scores with naive keyword-overlap only so the difference is visible.
3. **Live poll + verdict** — the app generates a shareable poll link (no login to vote, one tap on mobile). Votes accumulate in real time. The owner can close the test; the app then shows a verdict report: Qloo prediction vs actual vote result, winner, vote breakdown, and a one-paragraph recommendation. The report must be printable (print CSS).

Also include a **preloaded completed sample test** on the home screen ("Bloomington indie cafe: which weekend special poster?") with prediction, some votes, and a closed verdict, so a first-time visitor sees the full loop in under 30 seconds.

Design direction (locked Oct 8 — "Linear calm, Raycast glow"):
- Base the whole UI on Linear's language: dark, precise, calm, dense-but-readable data, one clear hierarchy per screen, hairline borders, generous spacing. The app should feel like a serious startup tool, not a hackathon demo.
- Borrow exactly ONE thing from Raycast: a vibrant gradient accent used sparingly — only on the predicted winner's score bar, the "Agent pick" badge, and the final verdict number. Everything else stays monochrome/neutral. No rainbow, no multiple gradients.
- Forms follow Stripe's UX: friendly validation, errors explained in plain words, no friction. The Create Test form is the highest-risk screen; keep it to two option cards + taste-seed chips + one optional note.
- Poll empty states follow real-product patterns (Mobbin-style): never show a dead 0-vote screen. The preloaded completed cafe sample is the default first screen.
- Signature micro-interactions (small effects, restrained): score bars count up on prediction; voting gives instant spring feedback and bars animate without reload; option cards lift subtly on hover; closing a test reveals the verdict report in staggered blocks. Respect `prefers-reduced-motion`. No WebGL, no custom cursor, no scroll-jacking.
- Typography: Inter or Geist-style sans, large verdict numbers, small caps labels for scores.

Architecture requirements:
- Frontend: single-page web app (your choice of a simple stack you can deploy to Netlify). Mobile-first poll page.
- All Qloo access goes through ONE server-side adapter module/function, `qlooAdapter`, with this interface: `searchEntities(query, type)`, `getInsights(seedEntityIds, targetTypes)`, `scoreOption(option, audienceProfile)`. For now implement it in **mock mode** (`USE_QLOO_MOCK=true` default) using hand-written synthetic fixtures that mimic the documented response shapes. Never hardcode mock data in UI components; the UI only calls the adapter.
- Real-mode notes to implement later (do not implement now): Qloo Insights is `GET https://hackathon.api.qloo.com/v2/insights?...` with all parameters in the query string (a POST/JSON body fails), API key in the `X-Api-Key` header, key only in a server-side env var `QLOO_API_KEY`, never in client code. Real Qloo responses may be cached only privately server-side — never commit real responses to the repo.
- Scoring must be explainable: every score decomposes into visible components (affinity sum, tag overlap, segment warning) shown in the UI.
- Poll storage: simplest server-side store you can deploy (e.g., Netlify Functions + a JSON/KV store or Supabase free tier). Votes are anonymous, one vote per browser (localStorage guard is fine).
- Repo hygiene from day one: public repo, MIT LICENSE visible, README with run instructions, `.env.example` containing only `QLOO_API_KEY=` and `USE_QLOO_MOCK=true`, `.env` gitignored, and a `QLOO_UPDATE_LOG.md` for dated entries of Qloo-integration work (proves the integration was built after Sep 30, 2026).

Definition of done for this mock build:
- A visitor can create a test, see a prediction, open the poll link in a private window, vote, close the test, and read the verdict — all with mock data.
- Toggling "Without Qloo" visibly changes scores/reasons.
- No real API key anywhere in the repo; `netlify dev` (or equivalent) runs clean.

Out of scope for now: user accounts, payments, multiple businesses, image upload/storage, any real Qloo calls, any LLM API.
