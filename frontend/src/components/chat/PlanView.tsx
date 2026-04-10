"use client";

import { T } from "@/lib/tokens";

export type PlanStepStatus = "pending" | "current" | "done" | "failed";

export interface PlanStep {
  id: string;
  label: string;
  detail?: string;
  status: PlanStepStatus;
  /** Tool call IDs linked to this step, for correlation with tool events */
  toolUseIds?: string[];
}

interface PlanViewProps {
  steps: PlanStep[];
  /** Compact mode — less padding, smaller font */
  compact?: boolean;
}

function StepIcon({ status }: { status: PlanStepStatus }) {
  const base: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "inherit",
  };

  switch (status) {
    case "done":
      return (
        <div style={{ ...base, background: T.success, color: "#fff" }}>✓</div>
      );
    case "failed":
      return (
        <div style={{ ...base, background: T.error, color: "#fff" }}>✗</div>
      );
    case "current":
      return (
        <div
          style={{
            ...base,
            background: T.accentDim,
            border: `2px solid ${T.accent}`,
            animation: "plan-spin 1.5s linear infinite",
          }}
        >
          <span style={{ color: T.accent, fontSize: 10 }}>◉</span>
        </div>
      );
    default:
      return (
        <div
          style={{
            ...base,
            background: "transparent",
            border: `1.5px solid ${T.border}`,
          }}
        />
      );
  }
}

export default function PlanView({ steps, compact = false }: PlanViewProps) {
  if (steps.length === 0) return null;

  const currentIdx = steps.findIndex((s) => s.status === "current");
  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        background: T.subtle,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: compact ? "8px 12px" : "10px 14px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: compact ? 11 : 12,
            fontFamily: T.mono,
            color: T.textSec,
          }}
        >
          Plan
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: T.mono,
            color: T.textFaint,
          }}
        >
          {doneCount}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: T.border }}>
        <div
          style={{
            height: "100%",
            width: `${steps.length > 0 ? (doneCount / steps.length) * 100 : 0}%`,
            background: T.accent,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Steps */}
      <div style={{ padding: compact ? "8px 12px" : "10px 14px" }}>
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const isCurrent = step.status === "current";

          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                gap: 10,
                position: "relative",
                paddingBottom: isLast ? 0 : compact ? 10 : 12,
              }}
            >
              {/* Connector line */}
              {!isLast && (
                <div
                  style={{
                    position: "absolute",
                    left: 9,
                    top: 22,
                    bottom: 0,
                    width: 1.5,
                    background: step.status === "done" ? T.success : T.border,
                    opacity: 0.5,
                  }}
                />
              )}

              <StepIcon status={step.status} />

              <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                <div
                  style={{
                    fontSize: compact ? 12 : 13,
                    color:
                      isCurrent
                        ? T.text
                        : step.status === "done"
                        ? T.textSec
                        : step.status === "failed"
                        ? T.error
                        : T.textMuted,
                    fontWeight: isCurrent ? 600 : 400,
                    lineHeight: 1.4,
                  }}
                >
                  {step.label}
                </div>

                {step.detail && (isCurrent || step.status === "failed") && (
                  <div
                    style={{
                      fontSize: 11,
                      color: step.status === "failed" ? T.error : T.textFaint,
                      marginTop: 2,
                      fontFamily: T.mono,
                      lineHeight: 1.5,
                    }}
                  >
                    {step.detail}
                  </div>
                )}

                {isCurrent && step.toolUseIds && step.toolUseIds.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {step.toolUseIds.map((id) => (
                      <span
                        key={id}
                        style={{
                          fontSize: 10,
                          fontFamily: T.mono,
                          color: T.accent,
                          background: T.accentDim,
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        {id.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes plan-spin {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.85); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
