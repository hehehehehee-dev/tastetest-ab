# Qloo integration work log

## 2026-10-08 — Mock-first implementation

- Created the server-only `qlooAdapter` interface: `searchEntities(query, type)`, `getInsights(seedEntityIds, targetTypes)`, and `scoreOption(option, audienceProfile)`.
- Added hand-authored synthetic entity/tag fixtures and Qloo-style `results.entities` / `query.affinity` envelopes. Every entity ID begins with `mock-`. No production response was obtained or committed.
- Implemented explainable cultural-affinity scoring, tag overlap, segment penalties, and a separate literal-keyword baseline.
- Connected server predictions to a working test/poll/verdict flow. Fixtures remain outside the frontend bundle.
- Real API access has **not** been implemented. No Qloo API key is needed for this version.

This log records implementation dates. It does not by itself establish hackathon eligibility or a completed real Qloo integration.

## Original real-mode checklist (recorded before integration)

- Confirm the hackathon API's current search and Insights response schemas, access scope, and terms when the key arrives.
- Replace the adapter internals and normalize real responses into the existing interface. Keep the UI and poll flow unchanged.
- For the hackathon endpoint specified in the project brief, use `GET https://hackathon.api.qloo.com/v2/insights` with query-string parameters and an `X-Api-Key` header. Use the server-only `QLOO_API_KEY` environment variable.
- Resolve taste entities to real IDs; never pass `mock-*` identifiers into real Qloo calls.
- Store any real-response cache privately on the server; never commit captured responses or a key. Do not expose raw responses unnecessarily.
- Revisit normalization/scoring against actual affinity distributions and validate results. Synthetic demo scores are not calibrated probabilities.

References: [Qloo Insights documentation](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

## 2026-10-09 — Real Qloo integration verified locally

- Verified HTTP 200 from the hackathon server for GET /search, GET /entities and GET /v2/insights using the event credential stored only in the ignored server environment file. No credential or captured response is committed.
- Normalized search/metadata result arrays and Insights results.entities, including entity_id versus id and tag_id versus id. Preserved real affinity values and explainability metadata.
- Added one Insights context per prediction, fixed concept-to-tag mapping version concept-tag-fit-v2, and per-test mode/provenance. Completed examples and their live twin retain explicit mock labels, even when fresh tests use real data.
- A burst verification received HTTP 429. Implemented serialized paced requests, cache/coalescing, Retry-After cooldown and explicit errors without mock fallback. A subsequent bounded verification succeeded with 3 real seeds, 5 place insights and heuristic scores 11/9: too close to call, not accuracy evidence. Its private artifact remains under .local/.
- Offline contract/error/quota tests use hand-authored transport fixtures; browser regressions use a separate mock server on port 5174. Real responses are not test fixtures.
- Netlify needs private Functions environment variables before production fresh tests can use real mode. Browser assets and the public repository contain no credential.

Primary references: [Entity Search](https://github.com/qloo/docs-public/blob/main/reference/get-search.md), [Entity lookup](https://github.com/qloo/docs-public/blob/main/reference/get-entities.md), [Insights parameters](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md).

## 2026-10-09 — Paired AI feature

Added an optional AI only / AI + Qloo mode using the same configurable OpenAI Responses model, common instructions and text inputs. The grounded branch receives actual Qloo tags/affinities; the baseline does not. Both choices are persisted with timestamps, exact prompts, response IDs and an integrity hash before voting is allowed. Owner-only opening and pre-closure API redaction keep predictions away from voters. Closure reports both choices against observed votes and explicit low-response/tie/abstention states.

The former Without Qloo toggle is now labeled Keyword baseline. It remains a heuristic and is separate from the model comparison. Real paired execution is not verified yet because OPENAI_API_KEY and OPENAI_MODEL are absent. Automated validation uses synthetic fixtures, not benchmark evidence. No superiority claim or new audience data has been produced.
