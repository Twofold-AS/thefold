"use client";

import type { AgentPhaseProps } from "./types";
import { StepList } from "./StepList";

/** Phase: stopped — task was cancelled/moved to backlog/blocked externally */
export function AgentStopped({ data, onDismiss }: AgentPhaseProps) {
  return (
    <div style={{ border: "1px solid var(--border)" }}>
      <div
        className="px-4 py-3"
        style={{
          borderBottom:
            data.steps.length > 0 || data.error
              ? "1px solid rgba(255,255,255,0.06)"
              : "none",
        }}
      >
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Oppgave stoppet
        </span>
      </div>

      {/* Reason */}
      {data.error && (
        <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.02)" }}>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {data.error}
          </span>
        </div>
      )}

      <StepList steps={data.steps} />

      {/* Dismiss */}
      {onDismiss && (
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={onDismiss}
            className="text-xs px-3 py-1.5"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Lukk
          </button>
        </div>
      )}
    </div>
  );
}
