"use client";

import { T } from "@/lib/tokens";
import { type SlashCommand } from "@/lib/slash-commands";

interface SlashCommandDropdownProps {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
}

// Fase I.8 — Plain-text dropdown under chatboksen som lister slash-commands.
// Rendered KUN når brukeren skriver "/" + eventuelt starten på en kommando.

export default function SlashCommandDropdown({ commands, activeIndex, onSelect, onHover }: SlashCommandDropdownProps) {
  if (commands.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 6,
        background: T.popup ?? T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        fontFamily: T.sans,
      }}
    >
      {commands.map((c, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={c.id}
            onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}
            onMouseEnter={() => onHover(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              cursor: "pointer",
              background: isActive ? T.tabActive : "transparent",
            }}
          >
            <span style={{
              fontSize: 12,
              color: T.accent,
              fontFamily: T.mono,
              fontWeight: 500,
              minWidth: 80,
            }}>
              /{c.trigger}
            </span>
            <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>
              {c.description}
            </span>
          </div>
        );
      })}
      <div style={{
        padding: "6px 12px",
        borderTop: `1px solid ${T.border}`,
        fontSize: 10,
        color: T.textFaint,
        background: T.subtle,
        fontFamily: T.mono,
      }}>
        ↑↓ navigate · ⏎ select · esc cancel
      </div>
    </div>
  );
}
