"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface MemoryEntry {
  content: string;
  memoryType: string;
  decayedScore: number;
  createdAt?: string;
}

interface MemoryInsightData {
  type: "memory_insight";
  memories: MemoryEntry[];
  count: number;
}

interface Props {
  content: string;
}

function formatAge(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "i dag";
  if (days === 1) return "1d siden";
  return `${days}d siden`;
}

function typeColor(memoryType: string): string {
  switch (memoryType) {
    case "decision": return T.accent;
    case "error_pattern": return T.error;
    case "strategy": return T.success;
    default: return T.textMuted;
  }
}

export default function MemoryInsight({ content }: Props) {
  const [expanded, setExpanded] = useState(false);

  let data: MemoryInsightData;
  try {
    data = JSON.parse(content);
    if (data.type !== "memory_insight") return null;
  } catch {
    return null;
  }

  const primary = data.memories[0];
  if (!primary) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 10px",
        background: "rgba(99,102,241,0.06)",
        border: `1px solid rgba(99,102,241,0.18)`,
        borderRadius: T.r,
        cursor: data.memories.length > 1 ? "pointer" : "default",
        userSelect: "none",
      }}
      onClick={() => data.memories.length > 1 && setExpanded((p) => !p)}
    >
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>💡</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T.accent, fontFamily: T.mono, fontWeight: 600 }}>
            Husker{data.count > 1 ? ` (${data.count})` : ""}:
          </span>
          <span style={{ fontSize: 12, color: T.textSec, lineHeight: 1.4 }}>
            {primary.content.length > 120 ? primary.content.slice(0, 120) + "…" : primary.content}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: typeColor(primary.memoryType), fontFamily: T.mono }}>
            {primary.memoryType}
          </span>
          {primary.createdAt && (
            <span style={{ fontSize: 10, color: T.textFaint }}>{formatAge(primary.createdAt)}</span>
          )}
          <span style={{ fontSize: 10, color: T.textFaint }}>
            styrke: {Math.round((primary.decayedScore || 0) * 100)}%
          </span>
          {data.memories.length > 1 && (
            <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>
              {expanded ? "▲ skjul" : `▼ +${data.memories.length - 1} til`}
            </span>
          )}
        </div>

        {expanded && data.memories.slice(1).map((m, i) => (
          <div
            key={i}
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid rgba(99,102,241,0.12)`,
            }}
          >
            <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.4 }}>
              {m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 10, color: typeColor(m.memoryType), fontFamily: T.mono }}>
                {m.memoryType}
              </span>
              {m.createdAt && (
                <span style={{ fontSize: 10, color: T.textFaint }}>{formatAge(m.createdAt)}</span>
              )}
              <span style={{ fontSize: 10, color: T.textFaint }}>
                styrke: {Math.round((m.decayedScore || 0) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
