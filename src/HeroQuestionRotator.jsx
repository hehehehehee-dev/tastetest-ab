import React, { useEffect, useState } from "react";

export const HERO_QUESTIONS = [
  "Which poster gets them in?",
  "Which special sells out first?",
  "Which name do fans remember?",
  "Which theme fills the room?",
];

const VISIBLE_MS = 3800;
const FADE_MS = 450;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HeroQuestionRotator() {
  const [index, setIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      setReducedMotion(media.matches);
      if (media.matches) {
        setIndex(0);
        setIsFading(false);
      }
    };
    media.addEventListener("change", updateMotionPreference);
    return () => media.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => {
      const visible = !document.hidden;
      setTabVisible(visible);
      if (visible) setIsFading(false);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (reducedMotion || !tabVisible) return undefined;

    const leaveTimer = window.setTimeout(() => setIsFading(true), VISIBLE_MS);
    const nextTimer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % HERO_QUESTIONS.length);
      setIsFading(false);
    }, VISIBLE_MS + FADE_MS);

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
      <span className={`hero-question${isFading ? " is-fading" : ""}`}>
        {HERO_QUESTIONS[index]}
      </span>
    </h1>
  );
}
