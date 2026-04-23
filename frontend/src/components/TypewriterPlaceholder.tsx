"use client";

import { useState, useEffect } from "react";
import { T } from "@/lib/tokens";

interface TypewriterPlaceholderProps {
  /** Set true when the user has focused/interacted with the input; hides
   *  the animation immediately and stops further typing. */
  active?: boolean;
}

const phrases = [
  "Beskriv hva du jobber med...",
  "Forklar et problem...",
  "Hva trenger du hjelp med?",
];

// Typing cadence (ms). Slower than before so the animation feels
// meditative rather than frantic.
const TYPE_MS = 160;
const TYPE_JITTER_MS = 80;
const ERASE_MS = 60;
const PAUSE_BEFORE_ERASE_MS = 3500;

export default function TypewriterPlaceholder({ active }: TypewriterPlaceholderProps) {
  const [pi, setPi] = useState(0);
  const [ci, setCi] = useState(0);
  const [d, setD] = useState(false);

  useEffect(() => {
    if (active) return;
    let t: ReturnType<typeof setTimeout>;
    const p = phrases[pi];
    if (!d) {
      if (ci < p.length) {
        t = setTimeout(() => setCi((c) => c + 1), TYPE_MS + Math.random() * TYPE_JITTER_MS);
      } else {
        t = setTimeout(() => setD(true), PAUSE_BEFORE_ERASE_MS);
      }
    } else {
      if (ci > 0) {
        t = setTimeout(() => setCi((c) => c - 1), ERASE_MS);
      } else {
        setD(false);
        setPi((x) => (x + 1) % phrases.length);
      }
    }
    return () => clearTimeout(t);
  }, [ci, d, pi, active]);

  if (active) return null;

  return (
    <span
      style={{
        pointerEvents: "none",
        userSelect: "none",
        fontWeight: 400,
        color: "transparent",
        backgroundImage:
          "linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.3) 100%)",
        backgroundSize: "200% 100%",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        animation: "tf-shimmer 2.5s linear infinite",
      }}
    >
      {phrases[pi].slice(0, ci)}
      <span style={{ animation: "blink 1s step-end infinite" }}>|</span>
    </span>
  );
}
