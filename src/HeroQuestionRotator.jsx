import React, { useEffect, useState } from "react";

export const HERO_QUESTIONS = [
  "Which poster gets them in?",
  "Which special sells out first?",
  "Which name do fans remember?",
  "Which theme fills the room?",
];

const VISIBLE_MS = 2800;
const TRANSITION_MS = 500;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HeroQuestionRotator() {
  const [index, setIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setReducedMotion(media.matches);
      if (media.matches) {
        setIndex(0);
        setNextIndex(null);
      }
    };
    media.addEventListener("change", updateMotionPreference);
    return () => media.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => {
      const visible = !document.hidden;
      setTabVisible(visible);
      if (visible) setNextIndex(null);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (reducedMotion || !tabVisible) return undefined;

    const next = (index + 1) % HERO_QUESTIONS.length;
    const leaveTimer = window.setTimeout(() => setNextIndex(next), VISIBLE_MS);
    const nextTimer = window.setTimeout(() => {
      setIndex(next);
      setNextIndex(null);
    }, VISIBLE_MS + TRANSITION_MS);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(nextTimer);
    };
  }, [index, reducedMotion, tabVisible]);

  return (
    <h1
      className="hero-question-rotator"
      aria-live="polite"
      aria-atomic="true"
      data-question-index={index}
      data-rotation={reducedMotion ? "static" : "active"}
    >
      {nextIndex === null ? (
        <span key={index} className="hero-question">
          {HERO_QUESTIONS[index]}
        </span>
      ) : (
        <>
          <span className="hero-question is-leaving" aria-hidden="true">
            {HERO_QUESTIONS[index]}
          </span>
          <span key={nextIndex} className="hero-question is-entering">
            {HERO_QUESTIONS[nextIndex]}
          </span>
        </>
      )}
    </h1>
  );
}
