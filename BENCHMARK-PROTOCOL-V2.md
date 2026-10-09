# Benchmark protocol v2 — how to handle the Cookie Cats criticism (Oct 8, 2026)

The screenshot's three points are correct. This protocol replaces any looser claim made earlier.

## What the public datasets can and cannot prove

| Use | Allowed? | Why |
|---|---|---|
| Demo the workflow: blind prompt → committed prediction → reveal → score | Yes | Datasets contain real experiment outcomes to score against. |
| Claim "AI usually predicts A/B tests wrong" | **No** | The datasets contain no AI predictions; and 4 cases are too few anyway. |
| Claim "Qloo beats a plain LLM" | **No** | The datasets contain no audience-taste data for Qloo to use; Qloo would be guessing from the same text as the LLM. |
| Cite Cookie Cats as a real experiment result | Yes | Tactile Entertainment test, 90,189 players, distributed via DataCamp/Kaggle. |
| Treat a correct Cookie Cats answer as proof of reasoning | **No** | The case is famous; a model may recall the published answer. Mark it "possibly memorized". |

Any sentence like "a later gate may interrupt players less" must be labelled
**illustrative hypothesis**, never evidence.

## The fix: two tracks

### Track A — Public cases (workflow only)
Use `ab-benchmark-pack/BLIND-CASES.md` to practise the mechanics: force a committed winner +
confidence, reveal, score. Report results only as "workflow sanity check on public cases —
answers may be memorized by the model". Never use Track A numbers in a pitch as accuracy.

### Track B — Fresh taste cases (the real evidence)
Build 20–30 unpublished cases where each case has:
1. A target audience described by taste seeds (3–5 films/artists/brands the audience loves).
2. Two options that Qloo can score (menu items, poster concepts, product names, event themes —
   each expressible as Qloo entities/tags).
3. A real outcome collected AFTER predictions are frozen: a live poll (classmates, GroupMe,
   Discord, a cafe's Instagram story), click counts, or sales.

Rules that make Track B valid:
- **Freeze before reveal:** save the LLM prediction and the Qloo prediction (winner + confidence)
  in a file with a timestamp before any votes are collected.
- **No famous cases:** if the outcome is Google-able, the case is Track A, not Track B.
- **Rename surface details** (business names, city) in the prompt, but never change the causal
  facts of the case; changing facts changes the correct answer.
- **Score three columns:** LLM pick / Qloo pick / actual outcome, plus confidence calibration.
- **Minimum 20 cases** before quoting any hit rate; report the count with the rate ("14/20", not "70%").

This three-column table is the only honest basis for a Devpost sentence such as
"on 20 unpublished taste tests, the Qloo-informed agent matched the live outcome more often
than an LLM-only baseline" — and only if the numbers actually say that.

## Claim wording — use these, not the old ones
- ❌ "AI thường đoán sai kết quả A/B test."
- ✅ "Chưa có bằng chứng về độ chính xác của AI trên các bài toán mới; bộ dữ liệu công khai chỉ
  dùng để kiểm tra quy trình chấm, vì đáp án có thể đã nằm trong dữ liệu huấn luyện của mô hình."
- ❌ "Qloo dự đoán tốt hơn ChatGPT."
- ✅ "Giả thuyết cần kiểm chứng: khi bài toán có thông tin về gu của khách, điểm affinity của Qloo
  giúp dự đoán sát kết quả khảo sát thật hơn mô hình ngôn ngữ đơn thuần. Kiểm chứng bằng Track B."

## Where this leaves TasteTest
Nothing about the product changes: Qloo still produces a prior with a confidence level, the live
poll still decides, and a miss still triggers the diagnosis + Round 2 flow. The benchmark work
only governs what we may *claim* about accuracy — in the Devpost text and in the demo script.
