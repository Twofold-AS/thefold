"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CornerDownRight } from "lucide-react";
import { T } from "@/lib/tokens";

export interface ConcernsCollapsibleProps {
  concerns: string[];
}

/**
 * Compact collapsible for "Bekymringer (N)". Mirrors SkillsCollapsible —
 * one muted header line with chevron, expands to the bullet list. Default
 * collapsed so the review-card doesn't flood the chat with noise.
 */
export default function ConcernsCollapsible({ concerns }: ConcernsCollapsibleProps) {
  const [open, setOpen] = useState(false);
  const count = concerns.length;
  if (count === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: T.mono,
        fontSize: 11,
        color: T.textMuted,
        marginTop: 8,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 0",
          background: "none",
          border: "none",
          color: T.textMuted,
          cursor: "pointer",
          fontFamily: T.mono,
          fontSize: 11,
          textAlign: "left",
          width: "fit-content",
        }}
        aria-expanded={open}
      >
        {open
          ? <ChevronUp size={12} color={T.textMuted} />
          : <ChevronDown size={12} color={T.textMuted} />
        }
        <span>Bekymringer</span>
        <span style={{ color: T.textFaint }}>({count})</span>
      </button>
      <div
        style={{
          maxHeight: open ? `${count * 40 + 8}px` : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 220ms ease, opacity 180ms ease",
          paddingLeft: 14,
          marginTop: open ? 4 : 0,
        }}
      >
        {concerns.map((c, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              padding: "2px 0 4px",
              color: T.textSec,
              lineHeight: 1.5,
              fontSize: 12,
              fontFamily: T.sans,
            }}
          >
            <CornerDownRight size={12} color={T.textFaint} style={{ marginTop: 3, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
