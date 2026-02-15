"use client";

import { useState } from "react";

export interface AgentStep {
  label: string;
  icon?: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

interface AgentStatusProps {
  steps: AgentStep[];
  currentPhase: string;
  subPhase?: string;
  progress?: { current: number; total: number } | number;
  isComplete?: boolean;
}

const ICON_MAP: Record<string, string> = {
  search: "\u{1F50D}",
  sparkle: "\u2728",
  code: "\u{1F4BB}",
  file: "\u{1F4C4}",
  test: "\u{1F9EA}",
  deploy: "\u{1F680}",
  error: "\u26A1",
  check: "\u2713",
  service: "\u{1F517}",
  chart: "\u{1F4CA}",
};

export function AgentStatus({ steps, currentPhase, subPhase, progress, isComplete }: AgentStatusProps) {
  const [collapsed, setCollapsed] = useState(false);

  const progressObj = typeof progress === "number"
    ? null
    : progress;

  return (
    <div className="my-3 max-w-md message-enter">
      {/* Header with TF icon + animated phase text */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        style={{ border: "1px solid var(--border)", borderBottom: collapsed ? "1px solid var(--border)" : "none" }}
        onClick={() => setCollapsed(!collapsed)}
      >
        {/* TF icon with pulse */}
        <div className="relative shrink-0">
          <div className="w-8 h-8 flex items-center justify-center" style={{ border: "1px solid var(--border)" }}>
            <span className="font-brand text-xs" style={{ color: "var(--text-primary)" }}>TF</span>
          </div>
          {!isComplete && <div className="absolute -top-1 -right-1 agent-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />}
        </div>

        {/* Phase text with shimmer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium ${!isComplete ? "agent-shimmer" : ""}`}
              style={{ color: "var(--text-primary)" }}
            >
              {currentPhase}
            </span>
            {progressObj && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                ({progressObj.current}/{progressObj.total})
              </span>
            )}
          </div>
          {subPhase && (
            <span className="text-xs block truncate agent-typing" style={{ color: "var(--text-muted)" }}>
              {subPhase}
            </span>
          )}
        </div>

        {/* Collapse chevron */}
        <svg
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          style={{ color: "var(--text-muted)" }}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>

      {/* Steps list */}
      {!collapsed && steps.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderTop: "none" }}>
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                borderBottom: i < steps.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                animation: step.status === "active" ? "none" : `agent-step-enter 0.3s ease-out ${i * 0.08}s both`,
              }}
            >
              {/* Icon */}
              <span className="w-5 text-center shrink-0">
                {step.status === "active" ? (
                  <span className="inline-block agent-spinner-small" />
                ) : step.status === "done" ? (
                  <span className="text-green-500 text-sm agent-check-in">{"\u2713"}</span>
                ) : step.status === "error" ? (
                  <span className="text-red-500 text-sm">{"\u2715"}</span>
                ) : (
                  <span className="text-sm opacity-30">{ICON_MAP[step.icon || ""] || "\u25CB"}</span>
                )}
              </span>

              {/* Label with shimmer when active */}
              <span
                className={`text-sm flex-1 ${step.status === "active" ? "agent-shimmer" : ""}`}
                style={{
                  color: step.status === "done" ? "var(--text-muted)"
                    : step.status === "active" ? "var(--text-primary)"
                    : "rgba(255,255,255,0.25)",
                  textDecoration: step.status === "done" ? "line-through" : "none",
                  textDecorationColor: "rgba(255,255,255,0.15)",
                }}
              >
                {step.label}
              </span>

              {/* Detail */}
              {step.detail && (
                <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                  {step.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Parse builder progress messages into AgentStep format */
export function parseAgentMessage(content: string): AgentStep[] | null {
  if (!content.startsWith("Builder:")) return null;

  const phases = ["init", "scaffold", "dependencies", "implement", "integrate", "finalize"];
  const match = content.match(/Builder: (\w+).* \((\d+)\/(\d+)\) \[(\w+)\]/);
  if (!match) return null;

  const currentPhase = match[1];
  const status = match[4];

  return phases.map((phase) => {
    const phaseIdx = phases.indexOf(phase);
    const currentIdx = phases.indexOf(currentPhase);

    let stepStatus: AgentStep["status"] = "pending";
    if (phaseIdx < currentIdx) stepStatus = "done";
    else if (phaseIdx === currentIdx) {
      stepStatus = status === "completed" ? "done" : status === "failed" ? "error" : "active";
    }

    return {
      label: phase.charAt(0).toUpperCase() + phase.slice(1),
      status: stepStatus,
    };
  });
}
