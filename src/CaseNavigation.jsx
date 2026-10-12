import React from "react";

export default function CaseNavigation() {
  return (
    <nav className="case-navigation" aria-label="Explore benchmark cases">
      <div className="case-navigation-copy">
        <span className="case-navigation-kicker">Start here · 2 minutes</span>
        <strong>Try a preference case</strong>
        <p>
          AI + Qloo → freeze → reveal historical data. Separate from Track B.
        </p>
      </div>
      <div className="case-navigation-primary">
        <a href="/benchmark/film/PX-001" aria-label="Film · start PX-001 ↗">
          <span>
            <small>Film proxy</small>
            <b>Start PX-001</b>
          </span>
          <span className="case-navigation-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
        <a href="/benchmark/music/MX-001" aria-label="Music · start MX-001 ↗">
          <span>
            <small>Music proxy</small>
            <b>Start MX-001</b>
          </span>
          <span className="case-navigation-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      </div>
      <div className="case-navigation-browse">
        <span>Explore all cases</span>
        <div className="case-navigation-links">
          <a href="/benchmark#film-cases">Browse 40 film cases</a>
          <a href="/benchmark#music-cases">Browse 40 music cases</a>
        </div>
      </div>
    </nav>
  );
}
