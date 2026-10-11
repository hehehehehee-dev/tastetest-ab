import React from "react";

export default function CaseNavigation() {
  return (
    <nav className="case-navigation" aria-label="Explore benchmark cases">
      <div>
        <strong>Try a preference case</strong>
        <p>
          AI + Qloo → freeze → reveal historical data. Separate from Track B.
        </p>
      </div>
      <div className="case-navigation-links">
        <a href="/benchmark/proxy/PX-001">Film · start PX-001 ↗</a>
        <a href="/benchmark/music/MX-001">Music · start MX-001 ↗</a>
        <a href="/benchmark#film-cases">Browse 40 film cases</a>
        <a href="/benchmark#music-cases">Browse 40 music cases</a>
      </div>
    </nav>
  );
}
