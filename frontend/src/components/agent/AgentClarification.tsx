"use client";

import { MotionIcon } from "motion-icons-react";
import "motion-icons-react/style.css";
import type { AgentPhaseProps } from "./types";
import { parseClarificationContent } from "./types";
import { StepList } from "./StepList";

/** Phase: clarification — agent is 95% sure but needs user input */
export function AgentClarification({
  data,
  onForceContinue,
  onCancelTask,
}: AgentPhaseProps) {
  // Parse the clarification content from questions or title
  const rawContent =
    data.questions?.join("\n") || data.title || "";
  const { uncertainties, questions } = parseClarificationContent(rawContent);

  // If parsing found nothing, fall back to the questions array directly
  const displayQuestions =
    questions.length > 0
      ? questions
      : data.questions && data.questions.length > 0
        ? data.questions
        : [];

  const taskId = data.taskId;

  return (
    <div style={{ border: "1px solid var(--border)" }}>
      {/* Title */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-sm" style={{ color: "#eab308" }}>
          Trenger avklaring
        </span>
      </div>

      <StepList steps={data.steps} />

      {/* Uncertainties summary */}
      {uncertainties.length > 0 && (
        <div
          className="px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p
            className="text-xs font-medium mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Usikkerheter
          </p>
          {uncertainties.slice(0, 3).map((u, i) => (
            <p
              key={i}
              className="text-sm mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {u}
            </p>
          ))}
        </div>
      )}

      {/* Questions — each in a separate box */}
      {displayQuestions.length > 0 && (
        <div
          className="px-4 py-3 space-y-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {displayQuestions.map((q, i) => (
            <div
              key={i}
              className="px-3 py-2.5"
              style={{
                border: "1px solid rgba(234,179,8,0.2)",
                background: "rgba(234,179,8,0.04)",
              }}
            >
              <div className="flex items-start gap-2">
                <span
                  className="text-xs font-medium mt-0.5 shrink-0"
                  style={{ color: "#eab308" }}
                >
                  {i + 1}.
                </span>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {q}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom bar: hint + buttons */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {/* Hint text */}
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs"
            style={{ color: "var(--text-muted)", opacity: 0.6 }}
          >
            Besvar nedenfor
          </span>
          <MotionIcon
            name="ChevronDown"
            size={12}
            color="var(--text-muted)"
            animation="bounce"
            trigger="hover"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {onForceContinue && taskId && (
            <button
              onClick={() => onForceContinue(taskId)}
              className="text-xs px-3 py-1.5"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Fortsett likevel
            </button>
          )}
          {onCancelTask && taskId && (
            <button
              onClick={() => onCancelTask(taskId)}
              className="text-xs px-3 py-1.5"
              style={{
                border: "1px solid #ef4444",
                color: "#ef4444",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Avbryt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
