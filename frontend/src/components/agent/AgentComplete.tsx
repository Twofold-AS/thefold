"use client";

import type { AgentPhaseProps } from "./types";
import { getPhaseTitle } from "./types";
import { StepList } from "./StepList";

/** Phase: done — task completed successfully */
export function AgentComplete({ data }: AgentPhaseProps) {
  return (
    <div style={{ border: "1px solid var(--border)" }}>
      <div
        className="px-4 py-3"
        style={{
          borderBottom: data.steps.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <span className="text-sm" style={{ color: "#22c55e" }}>
          {getPhaseTitle("Ferdig")}
        </span>
      </div>

      <StepList steps={data.steps} />
    </div>
  );
}
