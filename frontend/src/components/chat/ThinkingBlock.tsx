"use client";

import { useState, useEffect, useRef } from "react";
import { T } from "@/lib/tokens";

interface ThinkingBlockProps {
  thought: string;
  /** true while the agent is still reasoning — shows live timer */
  active?: boolean;
}

export default function ThinkingBlock({ thought, active = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  const elapsedLabel = active
    ? elapsed < 60
      ? `${elapsed}s`
      : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : null;

  return (
    <div
      style={{
        marginBottom: 8,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: T.subtle,
        overflow: "hidden",
        transition: "all 0.2s ease",
      }}
    >
      {/* Header row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Animated brain icon */}
        <span
          style={{
            fontSize: 13,
            display: "inline-block",
            animation: active ? "thinking-pulse 1.4s ease-in-out infinite" : "none",
          }}
        >
          🧠
        </span>

        <span
          style={{
            fontSize: 12,
            color: T.textSec,
            fontFamily: T.mono,
            flex: 1,
          }}
        >
          {active ? "Tenker…" : "Tenkte"}
        </span>

        {elapsedLabel && (
          <span
            style={{
              fontSize: 11,
              fontFamily: T.mono,
              color: T.accent,
              background: T.accentDim,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {elapsedLabel}
          </span>
        )}

        <span
          style={{
            fontSize: 10,
            color: T.textFaint,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          ▶
        </span>
      </div>

      {/* Expandable content */}
      <div
        style={{
          maxHeight: expanded ? 400 : 0,
          overflow: "hidden",
          transition: "max-height 0.25s ease",
        }}
      >
        <div
          style={{
            padding: "0 12px 12px",
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: T.textSec,
              fontFamily: T.mono,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: T.subtle,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "10px 12px",
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {thought || <span style={{ color: T.textFaint }}>Ingen tanker registrert.</span>}
          </div>
        </div>
      </div>

      {/* Pulse keyframe — injected once via style tag */}
      <style>{`
        @keyframes thinking-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}
