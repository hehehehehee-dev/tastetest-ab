# Evidence protocol / Quy trình kiểm chứng

## Cookie Cats: chỉ diễn tập quy trình

Open `/benchmark-lab/historical-case-01` from the evidence footer: blind brief → option-card/source/model/confidence/rationale → Commit → separate Reveal → MATCH/MISS. The name is shown only after scoring. The server stores the immutable prediction and a browser capability; no result is returned until explicit reveal. Reload restores the lock. No LLM is called. Downloads omit the capability token and give visible feedback. Confidence here is the contributor’s declared confidence, not a measured model accuracy. The model should receive only the brief. This is procedural blinding, not secure concealment: public results can be recognized or memorized.

The CSV contains no model predictions. One case, or four cases, cannot establish AI failure or Qloo superiority. All statements such as “a later gate interrupts play less” are **illustrative hypotheses / giả thuyết minh họa**, not mechanisms established by this dataset. No cultural taste data exists here, so this case does not benchmark Qloo. Only aggregate player counts are included; the raw CSV is not redistributed. Source: [Cookie Cats](https://www.kaggle.com/datasets/mursideyarkin/mobile-games-ab-testing-cookie-cats). Aggregate totals: A 44,700 / B 45,489 players; D1 returners 20,034 / 20,119; D7 returners 8,502 / 8,279. Recompute from the original CSV rather than treating the display as independent evidence.

## Private prospective campaign

25 unpublished taste-based cases are planned. Local `private/draft.json` contains 25 unvalidated concept templates, not ready cases or completed experiments. It is ignored by Git. Do not publish prompts/options before collecting data. Newly drafted does not guarantee that similar ideas have never appeared elsewhere. The private pack is not automatically uploaded or pushed.

Each draft has 3–5 taste names, two concepts, blank entity IDs, blank AI/Qloo predictions, and blank outcomes. **Resolve real Qloo entities and validate both options can be scored before declaring a case ready.** Mere conceptual plausibility is not API compatibility. Existing `mock-*` IDs and keyword baseline scores are not real Qloo or ChatGPT predictions.

1. Recruit real respondents whose self-reported 3–5 tastes match the declared audience. Do not invent their preferences from the template. Replace/refine drafts before locking. Distinct cases should use distinct decisions; record audience overlap. Obtain appropriate consent; omit names/user IDs from public reports.
2. Register the same exact brief for both systems, fixed scoring/model settings, a fixed closing deadline, a per-case minimum response count, recruitment and duplicate rules. Twenty responses is a quality floor, not a power guarantee. Randomize A/B display order, then map counts back to canonical A/B. Choose metrics/exclusions now. No stopping when results become favorable.
3. Obtain an actual ChatGPT answer without outcome access: record exact model/version, prompt, answer, rationale, generatedAt. For Qloo, archive actual requests/responses, API/scoring version and fixed mapping from affinities to A/B/tie. Save artifacts outside Git. Both receive the same audience/options; no outcome access. Mark each prediction `mode: "real"`. `artifact` paths are relative to the private directory. Use `tie` only under a predefined scoring tie rule.
4. Set each case `status: "ready"`, fill `entityId` for every seed and `entityIds` for each option, and fill the two predictions. Run:

   ```sh
   node research/study.mjs lock research/private
   ```

   The command validates all 20–30 cases, hashes raw prediction artifacts, and writes `locked.json` and `lock-manifest.json` without overwriting existing files. Publish **only the digest**, with an independent timestamp, before sharing polls. An OS timestamp, self-reported receipt, or Git author date alone is not trusted proof. Obtain a verifiable timestamp receipt or a publicly timestamped digest announcement. Keep the sensitive prompts private. Save `{ "sha256": "...", "timestamp": "ISO UTC", "reference": "verifiable URL/receipt" }` to a receipt file.

   ```sh
   node research/study.mjs open research/private path/to/receipt.json
   ```

   The tool checks structure/order, not external authenticity. Verify the timestamp service/announcement manually. Local files are editable; SHA-256 binds content only when compared with the independently published digest. Archive immutable copies of lock, opening, receipts and artifacts. Never repair/relock a started campaign; begin a new preregistered campaign instead.

5. Collect actual blind preferences via screened class participants, GroupMe, cafe stories or another declared channel. This tool does not send messages or collect votes automatically. Public social polls cannot verify taste matching, randomize order or deduplicate reliably; use them only if those limitations are addressed and recorded. The current app poll identifies browsers, not people, and is not automatically linked to this campaign.
6. After the registered deadline, fill `results-template.json` with canonical counts and raw-result artifact paths. `collectionStartedAt` must follow opening; `closedAt` must follow the deadline. Mark audienceMatched/randomizedOrder/deduplicated true only if actually verified. Record the source, including failed/low-response cases. Results artifact paths are relative to the results JSON file.

   ```sh
   node research/study.mjs score research/private research/private/results-template.json
   ```

   Report rows show AI choice / Qloo choice / observed winner and A/B counts. Missing results, observed ties and below-minimum cases are reported as exclusions, never silently dropped. Predicted ties count as incorrect on non-tied outcomes. Archive raw responses so aggregates can be audited; the CLI does not prove aggregate counts are truthful. No participant identifiers need be published.

## Reporting without overclaiming

Report registered N, evaluable N, both correct counts/rates, discordant pairs, exclusions, respondent totals and audience overlap. The tool calculates the [exact paired McNemar test](https://www.statsmodels.org/dev/generated/statsmodels.stats.contingency_tables.mcnemar.html) on discordant correctness pairs. Reused cohorts/correlated cases violate simple independence assumptions; disclose them and treat the p-value cautiously. Poll majority is a noisy preference measure, not measured purchase/retention uplift or causal proof.

Twenty evaluable cases is the campaign's minimum reporting threshold, **not sufficient proof of superiority**. Even a favorable result should read: “On N preregistered cases, Qloo matched X observed preference winners versus Y for [exact model/version]; paired exact p = P. These convenience samples do not establish general superiority.” If N < 20, call it a pilot. Publish all preregistered outcomes after collection, not just favorable examples. Cookie Cats is excluded from prospective accuracy counts.

Safe Devpost text today: “We implemented a historical commit/reveal rehearsal and planned a 25-case private prospective study. Real model predictions and audience outcomes have not yet been collected. The working cultural adapter remains mock-only.”
