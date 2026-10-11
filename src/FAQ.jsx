import React from "react";

const questions = [
  [
    "What does TasteTest do?",
    <p>
      TasteTest records a prediction about two options, locks it, then compares
      it with an observed outcome. The verdict shows the actual winner first,
      followed by each predictor’s choice and whether it matched.
    </p>,
  ],
  [
    "How do I try a film or music case?",
    <p>
      Open <a href="/benchmark#film-cases">film cases</a> or{" "}
      <a href="/benchmark#music-cases">music cases</a> and choose a case. Your
      optional A/B guess appears on that same page. Show results runs the
      configured AI when available, freezes the predictions, then reveals the
      historical outcome.
    </p>,
  ],
  [
    "Do I have to enter a prediction or write a reason?",
    <p>
      No. In the film and music proxy flow, your own guess is optional and does
      not replace the AI branch. Skipping your guess still runs automatic AI on
      an enabled, configured server. No reason is required. If automatic AI is
      unavailable, its branch is marked Not run rather than inventing an answer.
    </p>,
  ],
  [
    "What is the difference between AI and Qloo?",
    <p>
      The proxy AI predicts from the seed names, audience description and two
      options, without seeing Qloo’s answer or the hidden outcome. Real-mode
      Qloo resolves the seeds and candidates to cultural entities and scores
      candidate affinity. These are different prediction sources; neither
      guarantees the actual audience preference. Mock cases use synthetic
      signals and are labeled separately.
    </p>,
  ],
  [
    "Which AI model does the proxy use?",
    <p>
      The only active Replicate model is GPT-5. A recorded or frozen prediction
      records the official model name, response ID and Replicate's honest
      provider-managed version disclosure in the freeze receipt. Using GPT-5
      does not automatically imply better measured benchmark accuracy.
    </p>,
  ],
  [
    "What do the numbers and confidence mean?",
    <p>
      MovieLens outcomes show mean ratings out of 5. Last.fm outcomes show mean
      observed listens per segment user, not vote shares. Qloo affinity measures
      cultural fit, not the probability of winning a poll. AI confidence is
      self-reported; Qloo confidence is a score-gap heuristic. Neither is
      calibrated as a success probability.
    </p>,
  ],
  [
    "Why freeze before revealing the answer?",
    <p>
      A freeze seals the predictions with an ISO timestamp and SHA-256 receipt
      hash, so later changes can be detected. It does not prove prediction
      accuracy. Proxy data already existed before the run; only its reveal is
      delayed. Fresh Track B cases must freeze before their poll opens.
    </p>,
  ],
  [
    "Do film and music results count toward Track B?",
    <p>
      No. Film proxy, music proxy and Track B have separate tallies. The proxies
      use historical preference data, not business outcomes or causal
      experiments. Their selected audience segments can overlap, so results
      describe this case set rather than general model superiority. A fresh
      Track B case needs at least 20 real, non-tied audience votes and must
      satisfy the benchmark protocol to count.
    </p>,
  ],
  [
    "What do Not run, Too close to call and low separation mean?",
    <p>
      Not run means that no prediction was recorded; it is not scored as a wrong
      answer. Too close to call is an abstention, shown separately from declared
      A/B accuracy. New proxy Qloo runs still pick the higher-scoring option
      when the gap is small, but show low separation; exact ties choose A. Older
      frozen runs retain their original policy.
    </p>,
  ],
  [
    "Where does the data come from?",
    <p>
      Film cases use{" "}
      <a
        href="https://grouplens.org/datasets/movielens/"
        target="_blank"
        rel="noreferrer"
      >
        GroupLens MovieLens
      </a>
      ; music cases use{" "}
      <a
        href="https://grouplens.org/datasets/hetrec-2011/"
        target="_blank"
        rel="noreferrer"
      >
        Last.fm / HetRec 2011
      </a>
      . Segment outcomes are computed from the raw historical data and withheld
      until reveal. The{" "}
      <a href="/case-study/cookie-cats">Cookie Cats case study</a> demonstrates
      the workflow; it does not establish AI or Qloo accuracy.
    </p>,
  ],
];

function Questions() {
  return (
    <div className="faq-questions">
      {questions.map(([question, answer]) => (
        <details className="faq-question" key={question}>
          <summary>{question}</summary>
          <div className="faq-answer">{answer}</div>
        </details>
      ))}
    </div>
  );
}

export default function FAQ({ compact = false }) {
  if (compact)
    return (
      <section
        className="container faq-section"
        aria-label="Frequently asked questions"
      >
        <details className="faq-drawer">
          <summary>
            <span>FAQ</span>
            <span>How it works, models & results</span>
          </summary>
          <Questions />
          <a className="faq-page-link" href="/faq">
            View all frequently asked questions ↗
          </a>
        </details>
      </section>
    );
  return (
    <main className="container faq-page">
      <a className="faq-page-link" href="/benchmark">
        ← Explore benchmark cases
      </a>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A QUICK GUIDE TO TASTETEST</div>
          <h1>Frequently asked questions</h1>
          <p>Understand the predictions. Read the result with confidence.</p>
        </div>
      </div>
      <Questions />
    </main>
  );
}
