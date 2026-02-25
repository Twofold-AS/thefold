"use client";

import { useState, useEffect } from "react";
import { T } from "@/lib/tokens";

interface TypewriterPlaceholderProps {
  active?: boolean;
}

const phrases = [
  "Beskriv hva du jobber med...",
  "Forklar et problem...",
  "Hva trenger du hjelp med?",
];

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
        t = setTimeout(() => setCi((c) => c + 1), 40 + Math.random() * 40);
      } else {
        t = setTimeout(() => setD(true), 2000);
      }
    } else {
      if (ci > 0) {
        t = setTimeout(() => setCi((c) => c - 1), 20);
      } else {
        setD(false);
        setPi((x) => (x + 1) % phrases.length);
      }
    }
    return () => clearTimeout(t);
  }, [ci, d, pi, active]);

  if (active) return null;

  return (
    <span style={{ color: T.textFaint, pointerEvents: "none", userSelect: "none" }}>
      {phrases[pi].slice(0, ci)}
      <span style={{ animation: "blink 1s step-end infinite" }}>|</span>
    </span>
  );
}
