"use client";

import { T } from "@/lib/tokens";
import CheckIcon from "@/components/icons/CheckIcon";
import Btn from "@/components/Btn";

interface StepInfo {
  id: string;
  label: string;
  done: boolean | null;
}

interface AgentReport {
  filesChanged: string[];
  costUsd: number;
  duration: string;
  qualityScore?: number;
}

interface AgentProgress {
  status: "thinking" | "working" | "done" | "failed" | "waiting";
  phase: string;
  summary: string;
  steps: StepInfo[];
  question?: string;
  report?: AgentReport;
}

interface AgentStreamProps {
  content?: string;
  onCancel?: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  thinking: "Tenker",
  preparing: "Forbereder",
  context: "Analyserer",
  confidence: "Vurderer",
  planning: "Planlegger",
  building: "Bygger",
  validating: "Validerer",
  reviewing: "Gjennomgar",
  completing: "Fullforer",
  failed: "Feilet",
  needs_input: "Trenger input",
  clarification: "Trenger avklaring",
  completed: "Ferdig",
};

function parseProgress(content?: string): AgentProgress | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    // Backend may wrap in { type: "progress", ...data }
    const data = parsed?.type === "progress" ? parsed : parsed;
    if (data && typeof data.status === "string" && typeof data.phase === "string") {
      return data as AgentProgress;
    }
    return null;
  } catch {
    return null;
  }
}

export default function AgentStream({ content, onCancel }: AgentStreamProps) {
  const progress = parseProgress(content);

  // If we can't parse, show raw content
  if (!progress) {
    return (
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: T.textSec,
          fontFamily: T.sans,
          paddingTop: 4,
        }}
      >
        {content || ""}
      </div>
    );
  }

  const phaseLabel = PHASE_LABELS[progress.phase] ?? progress.phase;
  const isWorking = progress.status === "working" || progress.status === "thinking";
  const isFailed = progress.status === "failed";
  const isDone = progress.status === "done";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 500 }}>
      {/* Phase header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: T.sans,
            color: isFailed ? T.error : isDone ? T.success : T.text,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {phaseLabel}
          {isWorking && (
            <span
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.18) 50%,transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmerMove 2s linear infinite",
              }}
            />
          )}
        </span>
        {isWorking && onCancel && (
          <Btn sm onClick={onCancel} style={{ marginLeft: "auto" }}>
            Stopp
          </Btn>
        )}
      </div>

      {/* Summary */}
      {progress.summary && (
        <div
          style={{
            fontSize: 12,
            color: isFailed ? T.error : T.textSec,
            fontFamily: T.sans,
            lineHeight: 1.5,
          }}
        >
          {progress.summary}
        </div>
      )}

      {/* Question (waiting) */}
      {progress.question && progress.status === "waiting" && (
        <div
          style={{
            padding: "8px 12px",
            background: T.accentDim,
            border: `1px solid ${T.accent}`,
            borderRadius: 6,
            fontSize: 12,
            color: T.text,
          }}
        >
          {progress.question}
        </div>
      )}

      {/* Steps */}
      {progress.steps && progress.steps.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 4 }}>
          {progress.steps.map((step) => (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "3px 0",
              }}
            >
              {step.done === true ? (
                <CheckIcon color={T.success} size={12} />
              ) : step.done === null ? (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    border: `2px solid ${T.accent}`,
                    borderTopColor: "transparent",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: T.textFaint,
                    }}
                  />
                </div>
              )}
              <span
                style={{
                  fontSize: 12,
                  fontFamily: T.sans,
                  color:
                    step.done === true
                      ? T.textMuted
                      : step.done === null
                        ? T.textSec
                        : T.textFaint,
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Report (when done) */}
      {isDone && progress.report && (
        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 14px",
            background: T.subtle,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            marginTop: 4,
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>
              FILER
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
              {progress.report.filesChanged.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>
              KOSTNAD
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: T.mono, color: T.text }}>
              ${progress.report.costUsd.toFixed(4)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>
              TID
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: T.mono, color: T.text }}>
              {progress.report.duration}
            </div>
          </div>
          {progress.report.qualityScore != null && (
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>
                KVALITET
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color:
                    progress.report.qualityScore >= 8
                      ? T.success
                      : progress.report.qualityScore >= 6
                        ? T.warning
                        : T.error,
                }}
              >
                {progress.report.qualityScore}/10
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
