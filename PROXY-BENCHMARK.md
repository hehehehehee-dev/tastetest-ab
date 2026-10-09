# MovieLens proxy benchmark

This is a retrospective preference proxy, separate from prospective Track B and historical Cookie Cats workflow rehearsal. It asks which candidate movie received the higher mean rating among users who rated all three seed movies at least 4.0 stars. It does not measure business outcomes, causal effects or prospective predictive accuracy.

## Dataset and fixed rules

The owner selected MovieLens 1M to retain the >=500 overall ratings threshold. The committed catalog contains 40 deterministic cases. The smaller `ml-latest-small` archive has no movie reaching 500 ratings (maximum 329), so it cannot meet that requirement. No threshold was weakened.

MovieLens 1M contains 1,000,209 ratings from 6,040 users. Raw rating/user records are not redistributed or committed; only case descriptions (movie titles, years, genres and seed lists) are public. Archives, source data and computed outcomes are held in ignored `.local/proxy-data/`. The application's software license does not grant a license to the source dataset.

## Reproducible generation

`scripts/build-proxy-cases.mjs` uses a seeded PRNG. It requires 30 users who each liked all three seeds, at least 20 observed ratings per candidate within that segment, a mean gap of at least 0.3 stars and (by default) at least 500 overall ratings per candidate. Seeds share a genre and have pairwise genre Jaccard similarity >=0.25. Candidates share a genre and have an overall popularity ratio <=1.5. These are declared confusability heuristics, not a validation that the task is difficult.

The default seed is `tastetest-proxy-v1`. Source file hashes, dataset name, rules and case-set hash are stored in the manifest. Seed triples and unordered candidate pairs do not repeat. Candidate A/B order is randomized independently of winner. Changing the dataset, thresholds or seed creates a new case set; do not compare it as if it were the old one.

Download and extract the official [MovieLens 1M archive](https://files.grouplens.org/datasets/movielens/ml-1m.zip) into `.local/proxy-data/ml-1m/`, then run:

```sh
node scripts/build-proxy-cases.mjs
```

Outputs:

- `server/data/proxy-cases.json`: committed inputs (titles, years, genres and seed-segment definition), with no winners, per-segment means or observed counts.
- `.local/proxy-data/proxy-outcomes.json`: gitignored private outcomes. Never import it in client code, commit it or upload it as a public asset.

## Private outcome seeding

Set a fresh, strong `PROXY_ADMIN_TOKEN` of at least 32 characters in the private server environment. For Netlify, set it with Functions scope and redeploy; do not use a `VITE_*` variable or reuse the Qloo key. The token is not returned by `/api/config` or any UI endpoint. Keep `.env.example` limited to its existing Qloo settings.

With the same token in the local process environment, run:

```sh
node --use-system-ca --env-file=.env scripts/seed-proxy-outcomes.mjs --url=http://localhost:5173
node --use-system-ca --env-file=.env scripts/seed-proxy-outcomes.mjs --url=https://taste-test-ab.netlify.app
```

The admin-only POST `/api/proxy/admin/seed` validates every threshold, winner, candidate identity and case-set hash before a conditional write to `proxy-outcomes/<case-set-hash>` in the same private store as polls. Reposting the identical batch is idempotent; replacing outcomes is rejected. No seeding credential or outcome body is logged. There is no public seeding UI or automatic unauthenticated bootstrap.

## Prediction and reveal

Starting a case resolves its seeds and candidates through the existing Qloo adapter. In mock mode the film genres generate explicitly synthetic taste signals; no real Qloo requests occur. In real mode film search must resolve an unambiguous title, and explicit year mismatches are rejected. Undated Qloo titles cannot independently attest the year. Missing or ambiguous films fail instead of silently substituting another film or switching to mock.

New real-mode runs use `GET /v2/insights` with the three seeds in `signal.interests.entities` and both resolved candidate IDs in `filter.results.entities`. The returned candidate's `query.affinity` directly determines its fit score: `100 × affinity`. Missing candidate results fail explicitly; there is no lexical or mock fallback. See the [Qloo parameter reference](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md). Qloo and Agent share this predictor and are not independent branches. The existing <10 fit-point abstention rule stays fixed, even if that causes many abstentions. Affinity is not a probability of votes, rating or calibrated confidence. MovieLens outcomes are never sent to Qloo.

After the manual independent answer is frozen, owners can inspect the fetched timestamp, endpoint, seed/candidate IDs, actual affinities and conversion formula. These are included in the immutable receipt hash. Previous `concept-tag-fit-v2` runs and receipts remain unchanged, identified as legacy. The tally lists methods present; a mixed-method tally cannot be cited as the accuracy of a single predictor.

The owner pastes the independent LLM answer with pick/confidence/exact model/version (or `human`) and confirms they have not viewed this segment's outcome. The same immutable freeze machinery locks all branches before reveal. Unlike Track B, ratings were collected in the past: the receipt marks `beforeOutcomeConfirmed=false`, `beforeRevealConfirmed=true` and identifies itself as retrospective.

Private case outcomes and branch grades are visible only in that owner's revealed run. The public case list has no per-case outcomes or prediction-grade rows. Aggregate proxy counts are shown separately for real-Qloo and mock mode; the first completed freeze per case/mode counts, and mock counts are workflow checks only. Displayed accuracy counts are correct / declared A-or-B picks; each branch's abstentions / completed cases are displayed alongside them. All-case counts remain in the API for auditing coverage. Proxy storage uses `proxy-runs`, `proxy-results` and `proxy-outcomes`; it never writes `benchmark-results` or changes Track B totals.

Familiar titles, repeated users across segments, selecting cases with a known rating gap, unequal/missing candidate observations, self-reported model identity and owner-selected external answers limit interpretation. Do not infer model superiority, business performance or causal effects from these counts. A retained freeze hash is not a signed external timestamp.

## Credit and terms

MovieLens data: GroupLens Research, University of Minnesota. Source and dataset terms: https://grouplens.org/datasets/movielens/ . Research/education use only under the relevant dataset's terms; no endorsement or commercial-use permission is implied. Derived inputs remain subject to those terms, independently of the application's MIT software license.

Citation: F. Maxwell Harper and Joseph A. Konstan (2015), _The MovieLens Datasets: History and Context_, ACM Transactions on Interactive Intelligent Systems 5(4), https://doi.org/10.1145/2827872 .
