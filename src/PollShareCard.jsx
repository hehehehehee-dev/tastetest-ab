import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Printer, QrCode } from "lucide-react";
import QRCode from "qrcode";

export function VoteGoal({ total, goal = 20 }) {
  const progress = Math.min(100, Math.round((total / goal) * 100));
  const reached = total >= goal;
  return (
    <div className={`vote-goal ${reached ? "is-reached" : ""}`}>
      <div className="vote-goal-label">
        <strong>
          {Math.min(total, goal)}/{goal} votes
        </strong>
        <span>
          {reached ? (
            <>
              <CheckCircle2 size={14} /> Evidence threshold reached
            </>
          ) : (
            `${goal - total} more real votes to qualify for the evidence benchmark`
          )}
        </span>
      </div>
      <div
        className="vote-goal-track"
        role="progressbar"
        aria-label="Evidence benchmark vote progress"
        aria-valuemin="0"
        aria-valuemax={goal}
        aria-valuenow={Math.min(total, goal)}
      >
        <div style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export default function PollShareCard({ url, title, total, goal = 20 }) {
  const canvas = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    QRCode.toCanvas(canvas.current, url, {
      width: 196,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#15131a", light: "#ffffff" },
    })
      .then(() => active && setReady(true))
      .catch(() => active && setReady(false));
    return () => {
      active = false;
    };
  }, [url]);

  function printCard() {
    document.body.classList.add("qr-print-mode");
    const clean = () => document.body.classList.remove("qr-print-mode");
    window.addEventListener("afterprint", clean, { once: true });
    window.print();
    window.setTimeout(clean, 1000);
  }

  return (
    <section className="poll-share-card" aria-label="Poll QR code">
      <div className="poll-share-copy">
        <span className="eyebrow">
          <QrCode size={14} /> SCAN TO VOTE
        </span>
        <h3>{title}</h3>
        <p>Point any phone camera at the code. No signup required.</p>
        <VoteGoal total={total} goal={goal} />
        <button
          type="button"
          className="button subtle poll-share-print"
          onClick={printCard}
          disabled={!ready}
        >
          <Printer size={15} /> Print QR card
        </button>
      </div>
      <div className="poll-share-qr">
        <canvas ref={canvas} role="img" aria-label={`QR code for ${url}`} />
        <small>{url}</small>
      </div>
    </section>
  );
}
