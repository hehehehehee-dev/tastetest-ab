import React, { useEffect, useRef, useState } from "react";
import {
  Disc3,
  Film,
  Utensils,
  Tag,
  BookOpen,
  Crosshair,
  Move,
} from "lucide-react";

export function usePointerLight() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let currentCard = null;
    const clearCard = () => {
      if (!currentCard) return;
      currentCard.style.removeProperty("--tilt-x");
      currentCard.style.removeProperty("--tilt-y");
      currentCard.removeAttribute("data-pointer");
      currentCard = null;
    };
    const move = (event) => {
      if (media.matches || !fine.matches || event.pointerType !== "mouse")
        return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty(
          "--beam-x",
          `${event.clientX}px`,
        );
        document.documentElement.style.setProperty(
          "--beam-y",
          `${event.clientY}px`,
        );
        const card = event.target.closest(
          ".prediction-card, .poll-choice, .taste-map",
        );
        if (currentCard !== card) clearCard();
        if (!card) return;
        currentCard = card;
        const rect = card.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        card.style.setProperty("--light-x", `${x}px`);
        card.style.setProperty("--light-y", `${y}px`);
        card.style.setProperty(
          "--tilt-x",
          `${-(y / rect.height - 0.5) * 3}deg`,
        );
        card.style.setProperty("--tilt-y", `${(x / rect.width - 0.5) * 3}deg`);
        card.setAttribute("data-pointer", "true");
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      clearCard();
    };
    const reset = () => {
      leave();
      document.documentElement.style.removeProperty("--beam-x");
      document.documentElement.style.removeProperty("--beam-y");
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    media.addEventListener("change", reset);
    return () => {
      reset();
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      media.removeEventListener("change", reset);
    };
  }, []);
}

const icons = {
  Music: Disc3,
  "Film/TV": Film,
  Dining: Utensils,
  Brands: Tag,
  Books: BookOpen,
};
const locations = [
  [21, 23],
  [79, 26],
  [20, 76],
  [79, 74],
  [50, 12],
];
export function TasteMap({ seeds }) {
  const board = useRef(null);
  const dragging = useRef(null);
  const [positions, setPositions] = useState({});
  const [active, setActive] = useState(null);
  const activeSeed = seeds.find((seed) => seed.entity_id === active);
  const point = (seed, index) =>
    positions[seed.entity_id] || locations[index % locations.length];
  const finishDrag = (event) => {
    if (dragging.current) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragging.current = null;
    }
  };
  return (
    <figure
      className="taste-map"
      aria-label="Interactive map of the selected audience tastes"
    >
      <figcaption className="map-caption">
        <span>
          <Crosshair size={13} />
          TASTE NETWORK
        </span>
        <span>{String(seeds.length).padStart(2, "0")} SIGNALS</span>
      </figcaption>
      <div className="map-board" ref={board}>
        <svg
          className="map-links"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <ellipse cx="50" cy="50" rx="30" ry="34" className="map-orbit" />
          <ellipse
            cx="50"
            cy="50"
            rx="18"
            ry="21"
            className="map-orbit inner"
          />
          <line x1="0" y1="50" x2="100" y2="50" className="map-guide" />
          <line x1="50" y1="0" x2="50" y2="100" className="map-guide" />
          {seeds.map((seed, i) => {
            const [x, y] = point(seed, i);
            return (
              <g
                key={seed.entity_id}
                className={active === seed.entity_id ? "lit" : ""}
              >
                <line
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  className="map-connection"
                />
                <circle r=".55" cx={x} cy={y} className="map-dot" />
              </g>
            );
          })}
        </svg>
        <div className="map-core">
          <Crosshair size={24} />
          <span>YOUR AUDIENCE</span>
          <strong>{seeds.length} tastes</strong>
        </div>
        {seeds.map((seed, i) => {
          const Icon = icons[seed.category] || Tag;
          const [x, y] = point(seed, i);
          return (
            <button
              type="button"
              key={seed.entity_id}
              className={`map-node ${active === seed.entity_id ? "lit" : ""}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`Explore ${seed.name}`}
              aria-pressed={active === seed.entity_id}
              onMouseEnter={() => setActive(seed.entity_id)}
              onFocus={() => setActive(seed.entity_id)}
              onClick={() => setActive(seed.entity_id)}
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse") return;
                dragging.current = seed.entity_id;
                setActive(seed.entity_id);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (dragging.current !== seed.entity_id || !board.current)
                  return;
                const rect = board.current.getBoundingClientRect();
                setPositions((old) => ({
                  ...old,
                  [seed.entity_id]: [
                    Math.min(
                      85,
                      Math.max(
                        15,
                        ((event.clientX - rect.left) / rect.width) * 100,
                      ),
                    ),
                    Math.min(
                      82,
                      Math.max(
                        18,
                        ((event.clientY - rect.top) / rect.height) * 100,
                      ),
                    ),
                  ],
                }));
              }}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              <span className="map-node-icon">
                <Icon size={17} />
              </span>
              <span className="map-node-name">{seed.name}</span>
            </button>
          );
        })}
      </div>
      <div className="map-readout" aria-live="polite">
        {activeSeed ? (
          <>
            <span>{activeSeed.category}</span>
            <strong>{activeSeed.tags.map((t) => t.name).join(" · ")}</strong>
          </>
        ) : (
          <>
            <Move size={12} />
            <span>Explore a taste. Discover its cues.</span>
          </>
        )}
      </div>
    </figure>
  );
}
