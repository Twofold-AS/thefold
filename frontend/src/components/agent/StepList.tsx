"use client";

import { MotionIcon } from "motion-icons-react";
import "motion-icons-react/style.css";
import type { AgentStep } from "./types";

/** Shared step-list renderer used by all phase components */
export function StepList({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) return null;

  return (
    <>
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2"
          style={{
            borderBottom:
              i < steps.length - 1
                ? "1px solid rgba(255,255,255,0.04)"
                : "none",
            animation:
              step.status === "active"
                ? "none"
                : `agent-step-enter 0.3s ease-out ${i * 0.08}s both`,
          }}
        >
          {/* Status icon — motion-icons-react */}
          <span className="w-5 flex items-center justify-center shrink-0">
            <StepIcon status={step.status} />
          </span>

          {/* Label */}
          <span
            className={`text-sm ${step.status === "active" ? "agent-shimmer" : ""}`}
            style={{
              color:
                step.status === "done"
                  ? "var(--text-muted)"
                  : step.status === "active"
                    ? "var(--text-primary)"
                    : step.status === "error"
                      ? "#ef4444"
                      : step.status === "info"
                        ? "var(--text-secondary)"
                        : "rgba(255,255,255,0.25)",
            }}
          >
            {step.label}
          </span>

          {step.detail && (
            <span
              className="text-xs ml-auto"
              style={{ color: "var(--text-muted)" }}
            >
              {step.detail}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function StepIcon({ status }: { status: AgentStep["status"] }) {
  switch (status) {
    case "active":
      return (
        <MotionIcon name="Loader2" animation="spin" size={16} />
      );
    case "done":
      return (
        <span className="text-green-500">
          <MotionIcon
            name="CheckCircle2"
            animation="pulse"
            trigger="hover"
            size={16}
            color="#22c55e"
          />
        </span>
      );
    case "error":
      return (
        <MotionIcon
          name="XCircle"
          animation="shake"
          trigger="hover"
          size={16}
          color="#ef4444"
        />
      );
    case "info":
      return (
        <MotionIcon
          name="Info"
          animation="bounce"
          trigger="hover"
          size={16}
          color="var(--text-secondary)"
        />
      );
    case "pending":
    default:
      return <MotionIcon name="Circle" size={16} color="rgba(255,255,255,0.2)" />;
  }
}
