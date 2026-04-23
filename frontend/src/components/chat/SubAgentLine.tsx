"use client";

// --- SubAgentLine (U6 — stub for Fase H) ---
// Renders a sub-agent swarm group as: parent-line "Agenter på oppgaven (N)"
// followed by N indented child-lines. Same visual language as ToolCallLine.
//
// Stub: not wired to any live data source yet. Fase H will emit SwarmGroupLine
// from orchestrate-sub-agents.ts and AgentStream will merge it into the stack.

import { type CSSProperties, useState } from "react";
import { T } from "@/lib/tokens";
import { ChevronDown, ChevronRight, Loader2, Check, AlertTriangle, MinusCircle } from "lucide-react";
import type { SwarmGroupLine, LineStatus } from "./types";

const ROLE_COLOR: Record<string, string> = {
  planner: "#3B82F6",      // bright blue (primary accent in deep-space palette)
  implementer: "#8ab4f8",
  tester: "#34d399",
  reviewer: "#fbbf24",
  documenter: "#93C5FD",   // light blue (replaces prior purple)
  researcher: "#60a5fa",
  security: "#ef4444",
};

function Icon({ status }: { status: LineStatus }) {
  const s = 14;
  if (status === "running") return <Loader2 size={s} color={T.accent} className="tf-spin" />;
  if (status === "done") return <Check size={s} color={T.success} />;
  if (status === "error") return <AlertTriangle size={s} color={T.error} />;
  if (status === "skipped") return <MinusCircle size={s} color={T.textMuted} />;
  return <ChevronRight size={s} color={T.textFaint} />;
}

export interface SubAgentLineProps {
  group: SwarmGroupLine;
  onAgentClick?: (agentIndex: number) => void;
}

export default function SubAgentLine({ group, onAgentClick }: SubAgentLineProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={parentLineStyle}
      >
        {expanded ? <ChevronDown size={14} color={T.textMuted} /> : <ChevronRight size={14} color={T.textMuted} />}
        <span style={{ fontSize: 12, color: T.text }}>{group.label}</span>
      </button>

      {expanded &&
        group.agents.map((a) => (
          <div
            key={`${group.id}-${a.index}`}
            role="button"
            tabIndex={0}
            onClick={() => onAgentClick?.(a.index)}
            style={childLineStyle}
          >
            <Icon status={a.status} />
            <span
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                fontWeight: 600,
                color: ROLE_COLOR[a.role] ?? T.textMuted,
                minWidth: 28,
              }}
            >
              {a.index}#
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text }}>{a.role}</span>
            <span
              style={{
                fontSize: 12,
                color: T.textMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              — {a.label}
            </span>
            {typeof a.durationMs === "number" && (
              <span style={{ fontSize: 11, color: T.textFaint, fontVariantNumeric: "tabular-nums" }}>
                {a.durationMs < 1000 ? `${a.durationMs}ms` : `${(a.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

const parentLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  paddingLeft: 20,
  paddingTop: 3,
  paddingBottom: 3,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
};

const childLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingLeft: 40,
  paddingTop: 3,
  paddingBottom: 3,
  cursor: "pointer",
};
