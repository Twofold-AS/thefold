"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CornerDownRight } from "lucide-react";
import { T } from "@/lib/tokens";

export interface SkillsCollapsibleProps {
  skills: Array<{ id: string; name: string; description?: string }>;
}

/**
 * Compact collapsible badge row for "Skills hentet". Used in AgentStream for
 * running agent tasks and on regular chat assistant messages to show which
 * skills were injected for that turn. Default collapsed — one muted line
 * with chevron; expands to a list of skill names.
 */
export default function SkillsCollapsible({ skills }: SkillsCollapsibleProps) {
  const [open, setOpen] = useState(false);
  const count = skills.length;
  if (count === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: T.mono,
        fontSize: 11,
        color: T.textMuted,
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
        <span>Skills hentet</span>
        <span style={{ color: T.textFaint }}>({count})</span>
      </button>
      <div
        style={{
          maxHeight: open ? `${Math.max(count, 1) * 22 + 4}px` : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 180ms ease, opacity 180ms ease",
          paddingLeft: 14,
        }}
      >
        {skills.map((skill) => (
          <div
            key={skill.id}
            title={skill.description ?? skill.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 0",
              color: T.textSec,
              cursor: "help",
            }}
          >
            <CornerDownRight size={12} color={T.textFaint} />
            <span>{skill.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
