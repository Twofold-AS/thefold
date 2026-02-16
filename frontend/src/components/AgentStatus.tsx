"use client";

import { useState } from "react";

export interface AgentStep {
  label: string;
  icon?: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

export interface AgentStatusData {
  phase: string;
  title: string;
  steps: AgentStep[];
  error?: string;
}

/** Phase-specific icon for the tab */
function PhaseIcon({ phase }: { phase: string }) {
  if (phase === "Ferdig") return <span className="text-green-500 text-sm">{"\u2713"}</span>;
  if (phase === "Feilet") return <span className="text-red-500 text-sm">{"\u2715"}</span>;

  if (phase === "Forbereder") {
    return (
      <div className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5">
        <div className="w-1.5 h-1.5 agent-grid-blink-1" style={{ background: "var(--text-primary)" }} />
        <div className="w-1.5 h-1.5 agent-grid-blink-2" style={{ background: "var(--text-primary)" }} />
        <div className="w-1.5 h-1.5 agent-grid-blink-3" style={{ background: "var(--text-primary)" }} />
        <div className="w-1.5 h-1.5 agent-grid-blink-4" style={{ background: "var(--text-primary)" }} />
      </div>
    );
  }

  if (phase === "Analyserer") {
    return (
      <svg className="w-3.5 h-3.5 agent-phase-pulse" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-primary)" }}>
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
      </svg>
    );
  }

  if (phase === "Planlegger") {
    return (
      <svg className="w-3.5 h-3.5 agent-phase-pulse" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-primary)" }}>
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" />
      </svg>
    );
  }

  if (phase === "Bygger") {
    return (
      <svg className="w-3.5 h-3.5 agent-build-swing" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-primary)" }}>
        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
      </svg>
    );
  }

  if (phase === "Reviewer") {
    return (
      <svg className="w-3.5 h-3.5 agent-phase-pulse" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-primary)" }}>
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    );
  }

  if (phase === "Utfører") {
    return (
      <svg className="w-3.5 h-3.5 agent-spin-slow" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-primary)" }}>
        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    );
  }

  // Default: Tenker, Genererer, etc.
  return <span className="inline-block agent-spinner-small" />;
}

export function AgentStatus({ data }: { data: AgentStatusData }) {
  const [collapsed, setCollapsed] = useState(false);
  const isFailed = data.phase === "Feilet";
  const isComplete = data.phase === "Ferdig";

  return (
    <div className="my-3 max-w-lg message-enter">
      {/* TAB — fase-indikator */}
      <div
        className="inline-flex items-center gap-2 px-4 py-2 cursor-pointer"
        style={{
          border: "1px solid var(--border)",
          borderBottom: collapsed ? "1px solid var(--border)" : "none",
          background: isFailed ? "rgba(239,68,68,0.08)" : "transparent",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <PhaseIcon phase={data.phase} />
        <span
          className={`text-sm font-medium ${!isComplete && !isFailed ? "agent-shimmer" : ""}`}
          style={{ color: isFailed ? "#ef4444" : "var(--text-primary)" }}
        >
          {data.phase}
        </span>
      </div>

      {/* BOKS — innhold */}
      {!collapsed && (
        <div style={{ border: "1px solid var(--border)" }}>
          {/* Tittel */}
          <div
            className="px-4 py-3"
            style={{ borderBottom: data.steps.length > 0 || data.error ? "1px solid rgba(255,255,255,0.06)" : "none" }}
          >
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              {data.title}
            </span>
          </div>

          {/* Feilmelding */}
          {data.error && (
            <div className="px-4 py-3" style={{ background: "rgba(239,68,68,0.05)" }}>
              <span className="text-sm" style={{ color: "#ef4444" }}>{data.error}</span>
            </div>
          )}

          {/* Steg-liste */}
          {data.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2"
              style={{
                borderBottom: i < data.steps.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                animation: step.status === "active" ? "none" : `agent-step-enter 0.3s ease-out ${i * 0.08}s both`,
              }}
            >
              {/* Status-ikon */}
              <span className="w-5 text-center shrink-0">
                {step.status === "done" && <span className="text-green-500 text-sm agent-check-in">{"\u2713"}</span>}
                {step.status === "active" && <span className="inline-block agent-spinner-small" />}
                {step.status === "error" && <span className="text-red-500 text-sm">{"\u2715"}</span>}
                {step.status === "pending" && <span style={{ color: "rgba(255,255,255,0.2)" }}>{"\u25CB"}</span>}
              </span>

              {/* Label */}
              <span
                className={`text-sm ${step.status === "active" ? "agent-shimmer" : ""}`}
                style={{
                  color: step.status === "done" ? "var(--text-muted)"
                    : step.status === "active" ? "var(--text-primary)"
                    : step.status === "error" ? "#ef4444"
                    : "rgba(255,255,255,0.25)",
                }}
              >
                {step.label}
              </span>

              {step.detail && (
                <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>{step.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Parse builder progress messages into AgentStatusData format */
export function parseAgentMessage(content: string): AgentStatusData | null {
  if (!content.startsWith("Builder:")) return null;

  const phases = ["init", "scaffold", "dependencies", "implement", "integrate", "finalize"];
  const match = content.match(/Builder: (\w+).* \((\d+)\/(\d+)\) \[(\w+)\]/);
  if (!match) return null;

  const currentPhase = match[1];
  const status = match[4];

  const steps: AgentStep[] = phases.map((phase) => {
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

  return {
    phase: "Bygger",
    title: `Fase: ${currentPhase}`,
    steps,
  };
}
