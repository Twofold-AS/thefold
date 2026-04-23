"use client";

// --- ValidationPhaseLine (U7 — stub for Fase K) ---
// One line per sandbox validation phase (Skrive filer / npm install /
// TypeScript / Build / Tests). Expand-button opens StdoutStreamModal
// (Fase K will implement the live-SSE modal).

import { type CSSProperties } from "react";
import { T } from "@/lib/tokens";
import { Loader2, Check, AlertTriangle, ChevronRight, MinusCircle, Terminal } from "lucide-react";
import type { ValidationPhaseLine as ValidationPhaseLineData, LineStatus } from "./types";

function Icon({ status }: { status: LineStatus }) {
  const s = 14;
  if (status === "running") return <Loader2 size={s} color={T.accent} className="tf-spin" />;
  if (status === "done") return <Check size={s} color={T.success} />;
  if (status === "error") return <AlertTriangle size={s} color={T.error} />;
  if (status === "skipped") return <MinusCircle size={s} color={T.textMuted} />;
  return <ChevronRight size={s} color={T.textFaint} />;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export interface ValidationPhaseLineProps {
  data: ValidationPhaseLineData;
  onOpenStdout?: (sandboxId: string | undefined, phaseIndex: number) => void;
}

export default function ValidationPhaseLine({ data, onOpenStdout }: ValidationPhaseLineProps) {
  return (
    <div style={lineStyle}>
      <Icon status={data.status} />
      <span style={{ fontSize: 12, color: T.text }}>{data.phaseName}</span>
      {data.detail && (
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
          — {data.detail}
        </span>
      )}
      {typeof data.durationMs === "number" && data.status !== "pending" && (
        <span style={{ fontSize: 11, color: T.textFaint, fontVariantNumeric: "tabular-nums" }}>
          {formatDuration(data.durationMs)}
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpenStdout?.(data.sandboxId, data.phaseIndex)}
        aria-label="Åpne stdout-strøm"
        style={stdoutButtonStyle}
      >
        <Terminal size={12} />
      </button>
    </div>
  );
}

const lineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingLeft: 20,
  paddingTop: 3,
  paddingBottom: 3,
};

const stdoutButtonStyle: CSSProperties = {
  background: "transparent",
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  padding: "2px 5px",
  cursor: "pointer",
  color: T.textMuted,
  display: "flex",
  alignItems: "center",
};
