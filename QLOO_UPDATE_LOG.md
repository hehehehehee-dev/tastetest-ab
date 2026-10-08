# Qloo integration work log

## 2026-10-08 — Mock-first implementation

- Created the server-only `qlooAdapter` interface: `searchEntities(query, type)`, `getInsights(seedEntityIds, targetTypes)`, and `scoreOption(option, audienceProfile)`.
- Added hand-authored synthetic entity/tag fixtures and Qloo-style `results.entities` / `query.affinity` envelopes. Every entity ID begins with `mock-`. No production response was obtained or committed.
- Implemented explainable cultural-affinity scoring, tag overlap, segment penalties, and a separate literal-keyword baseline.
- Connected server predictions to a working test/poll/verdict flow. Fixtures remain outside the frontend bundle.
- Real API access has **not** been implemented. No Qloo API key is needed for this version.

This log records implementation dates. It does not by itself establish hackathon eligibility or a completed real Qloo integration.

## Future real-mode work (not implemented)

- Confirm the hackathon API's current search and Insights response schemas, access scope, and terms when the key arrives.
- Replace the adapter internals and normalize real responses into the existing interface. Keep the UI and poll flow unchanged.
- For the hackathon endpoint specified in the project brief, use `GET https://hackathon.api.qloo.com/v2/insights` with query-string parameters and an `X-Api-Key` header. Use the server-only `QLOO_API_KEY` environment variable.
- Resolve taste entities to real IDs; never pass `mock-*` identifiers into real Qloo calls.
- Store any real-response cache privately on the server; never commit captured responses or a key. Do not expose raw responses unnecessarily.
- Revisit normalization/scoring against actual affinity distributions and validate results. Synthetic demo scores are not calibrated probabilities.

References: [Qloo Insights documentation](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
