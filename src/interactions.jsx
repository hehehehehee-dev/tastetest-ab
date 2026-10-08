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
// Spring the whole diagram from ordinary pointer movement. No press is needed.
function useHoverField() {
  const target = useRef({ x: 0, y: 0, power: 0 });
  const physics = useRef({ x: 0, y: 0, power: 0, vx: 0, vy: 0, vp: 0 });
  const frame = useRef(0);
  const enabled = useRef(false);
  const [motion, setMotion] = useState({ x: 0, y: 0, power: 0 });
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => {
      enabled.current = !reduced.matches && fine.matches;
      if (!enabled.current) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        target.current = { x: 0, y: 0, power: 0 };
        physics.current = { x: 0, y: 0, power: 0, vx: 0, vy: 0, vp: 0 };
        setMotion({ x: 0, y: 0, power: 0 });
      }
    };
    update();
    reduced.addEventListener("change", update);
    fine.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame.current);
      reduced.removeEventListener("change", update);
      fine.removeEventListener("change", update);
    };
  }, []);
  const animate = () => {
    const state = physics.current;
    let moving = false;
    for (const [key, velocity] of [
      ["x", "vx"],
      ["y", "vy"],
      ["power", "vp"],
    ]) {
      state[velocity] =
        (state[velocity] + (target.current[key] - state[key]) * 0.075) * 0.74;
      state[key] += state[velocity];
      if (
        Math.abs(target.current[key] - state[key]) > 0.001 ||
        Math.abs(state[velocity]) > 0.001
      )
        moving = true;
      else {
        state[key] = target.current[key];
        state[velocity] = 0;
      }
    }
    setMotion({ x: state.x, y: state.y, power: state.power });
    frame.current = moving ? requestAnimationFrame(animate) : 0;
  };
  const wake = () => {
    if (!frame.current) frame.current = requestAnimationFrame(animate);
  };
  const move = (event, board) => {
    if (!enabled.current || event.pointerType !== "mouse" || !board) return;
    const rect = board.getBoundingClientRect();
    target.current = {
      x: Math.max(
        -1,
        Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1),
      ),
      y: Math.max(
        -1,
        Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1),
      ),
      power: 1,
    };
    wake();
  };
  const leave = () => {
    target.current = { x: 0, y: 0, power: 0 };
    wake();
  };
  return { motion, move, leave };
}
export function TasteMap({ seeds }) {
  const board = useRef(null);
  const dragging = useRef(null);
  const [positions, setPositions] = useState({});
  const [active, setActive] = useState(null);
  const { motion, move, leave } = useHoverField();
  const activeSeed = seeds.find((seed) => seed.entity_id === active);
  const point = (seed, index) => {
    const [x, y] =
      positions[seed.entity_id] || locations[index % locations.length];
    if (dragging.current === seed.entity_id) return [x, y];
    const dx = x - (50 + motion.x * 50);
    const dy = y - (50 + motion.y * 50);
    const distance = Math.hypot(dx, dy) || 1;
    const repel = Math.max(0, 1 - distance / 48) * 13 * motion.power;
    return [
      Math.max(
        13,
        Math.min(87, x + (dx / distance) * repel + motion.x * 3 * motion.power),
      ),
      Math.max(
        16,
        Math.min(84, y + (dy / distance) * repel + motion.y * 4 * motion.power),
      ),
    ];
  };
  const coreX = 50 + motion.x * 3 * motion.power;
  const coreY = 50 + motion.y * 4 * motion.power;
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
      onPointerMove={(event) => move(event, board.current)}
      onPointerLeave={leave}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) leave();
      }}
    >
      <figcaption className="map-caption">
        <span>
          <Crosshair size={13} />
          TASTE NETWORK
        </span>
        <span>{String(seeds.length).padStart(2, "0")} SIGNALS</span>
      </figcaption>
      <div
        className="map-board"
        ref={board}
        style={{
          "--field-x": motion.x,
          "--field-y": motion.y,
          "--field-power": motion.power,
        }}
        data-hover-power={motion.power.toFixed(2)}
      >
        <div
          className="map-hover-halo"
          aria-hidden="true"
          style={{
            left: `${50 + motion.x * 50}%`,
            top: `${50 + motion.y * 50}%`,
            opacity: motion.power * 0.65,
          }}
        />
        <svg
          className="map-links"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <ellipse
            cx={coreX}
            cy={coreY}
            rx={30 + motion.power * 3}
            ry={34 - motion.power * 2}
            className="map-orbit"
          />
          <ellipse
            cx={coreX}
            cy={coreY}
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
                  x1={coreX}
                  y1={coreY}
                  x2={x}
                  y2={y}
                  className="map-connection"
                />
                <circle r=".55" cx={x} cy={y} className="map-dot" />
                <circle
                  r=".6"
                  className="map-traveler"
                  style={{ opacity: motion.power }}
                >
                  <animate
                    attributeName="cx"
                    values={`${x};${coreX}`}
                    dur={`${1.4 + i * 0.2}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values={`${y};${coreY}`}
                    dur={`${1.4 + i * 0.2}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            );
          })}
        </svg>
        <div
          className="map-core"
          style={{ left: `${coreX}%`, top: `${coreY}%` }}
        >
          <span className="core-wireframe" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
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
            <span>Move your mouse through the network.</span>
          </>
        )}
      </div>
    </figure>
  );
}
