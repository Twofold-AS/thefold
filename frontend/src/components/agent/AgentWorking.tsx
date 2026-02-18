"use client";

import { MotionIcon } from "motion-icons-react";
import "motion-icons-react/style.css";
import type { AgentPhaseProps } from "./types";
import { getPhaseTitle } from "./types";
import { StepList } from "./StepList";

/** Phase: working/building/planning/analysing — shows plan progress and active tasks */
export function AgentWorking({ data, lastThought }: AgentPhaseProps) {
  const title = data.planProgress
    ? `Utfører plan ${data.planProgress.current}/${data.planProgress.total}`
    : getPhaseTitle(data.phase);

  return (
    <div style={{ border: "1px solid var(--border)" }}>
      {/* Title + plan progress */}
      <div
        className="px-4 py-3"
        style={{
          borderBottom:
            data.steps.length > 0 || data.activeTasks?.length
              ? "1px solid rgba(255,255,255,0.06)"
              : "none",
        }}
      >
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
      </div>

      {/* Active tasks list */}
      {data.activeTasks && data.activeTasks.length > 0 && (
        <div
          className="px-4 py-2"
          style={{
            borderBottom:
              data.steps.length > 0
                ? "1px solid rgba(255,255,255,0.06)"
                : "none",
          }}
        >
          {data.activeTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1">
              <span className="w-4 flex items-center justify-center shrink-0">
                {t.status === "done" && (
                  <MotionIcon name="CheckCircle2" size={12} color="#22c55e" animation="pulse" trigger="hover" />
                )}
                {t.status === "in_progress" && (
                  <MotionIcon name="Loader2" animation="spin" size={12} />
                )}
                {t.status === "failed" && (
                  <MotionIcon name="XCircle" size={12} color="#ef4444" animation="shake" trigger="hover" />
                )}
                {(t.status === "pending" || t.status === "backlog") && (
                  <MotionIcon name="Circle" size={12} color="rgba(255,255,255,0.2)" />
                )}
              </span>
              <span
                className="text-xs"
                style={{
                  color:
                    t.status === "done"
                      ? "var(--text-muted)"
                      : t.status === "in_progress"
                        ? "var(--text-primary)"
                        : t.status === "failed"
                          ? "#ef4444"
                          : "rgba(255,255,255,0.3)",
                }}
              >
                {t.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      <StepList steps={data.steps} />

      {/* Last thought */}
      {lastThought && (
        <div className="px-4 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-xs italic opacity-40" style={{ color: "var(--text-muted)" }}>
            {lastThought}
          </span>
        </div>
      )}
    </div>
  );
}
