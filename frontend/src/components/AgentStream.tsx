"use client";

import { useMemo } from "react";
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
  reviewId?: string;
  concerns?: string[];
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
  onApprove?: (reviewId: string) => void;
  onReject?: (reviewId: string) => void;
  onRequestChanges?: (reviewId: string, feedback: string) => void;
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

function convertLegacy(parsed: any): AgentProgress | null {
  if (!parsed?.type) return null;
  switch (parsed.type) {
    case "status":
      return {
        status: parsed.meta?.error ? "failed" : "working",
        phase: parsed.phase || "building",
        summary: parsed.meta?.title || parsed.phase || "Jobber...",
        steps: (parsed.steps || []).map((s: any) => ({
          id: s.label,
          label: s.label,
          detail: s.detail,
          done: s.status === "done" ? true : s.status === "active" ? false : s.status === "error" ? true : null,
        })),
      };
    case "report":
      return {
        status: parsed.status === "completed" ? "done" : parsed.status === "failed" ? "failed" : "working",
        phase: parsed.status === "completed" ? "completing" : "building",
        summary: parsed.text?.substring(0, 200) || "",
        steps: [],
      };
    case "review":
      return {
        status: "waiting",
        phase: "reviewing",
        summary: `Venter pa godkjenning — ${parsed.reviewData?.filesChanged || 0} filer`,
        steps: [
          { id: "code", label: "Kode skrevet", done: true },
          { id: "validated", label: "Validert", done: true },
          { id: "review", label: `Kvalitet: ${parsed.reviewData?.quality || "?"}/10`, done: true },
          { id: "waiting", label: "Venter pa godkjenning", done: false },
        ],
        report: {
          filesChanged: [],
          costUsd: 0,
          duration: "",
          qualityScore: parsed.reviewData?.quality,
          concerns: parsed.reviewData?.concerns,
          reviewId: parsed.reviewData?.reviewId || "",
        },
      };
    case "clarification":
      return {
        status: "waiting",
        phase: "clarification",
        summary: "Trenger avklaring",
        steps: (parsed.steps || []).map((s: any) => ({
          id: s.label,
          label: s.label,
          done: null,
        })),
        question: parsed.questions?.[0] || "",
      };
    case "completion":
      return {
        status: "done",
        phase: "completing",
        summary: parsed.text || "Ferdig",
        steps: [],
      };
    case "progress":
      // progress med status=waiting er review-venting — bevar review-data
      if (parsed.status === "waiting") {
        return {
          status: "waiting",
          phase: "reviewing",
          summary: parsed.summary || "Venter pa godkjenning",
          steps: (parsed.steps || []).map((s: any) => ({
            id: s.id || s.label,
            label: s.label,
            done: s.done ?? (s.status === "done" ? true : s.status === "active" ? false : null),
          })),
          report: parsed.report,
        };
      }
      // Annen progress — standard konvertering
      return {
        status: parsed.status || "working",
        phase: parsed.phase || "building",
        summary: parsed.summary || "Jobber...",
        steps: (parsed.steps || []).map((s: any) => ({
          id: s.id || s.label,
          label: s.label,
          done: s.done ?? (s.status === "done" ? true : s.status === "active" ? false : null),
        })),
        report: parsed.report,
      };
    default:
      return null;
  }
}

function parseProgress(content?: string): AgentProgress | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    // New contract: { type: "progress", status, phase, ... }
    if (parsed?.type === "progress" && typeof parsed.status === "string") {
      return parsed as AgentProgress;
    }
    // Direct AgentProgress shape (no type wrapper)
    if (parsed && typeof parsed.status === "string" && typeof parsed.phase === "string") {
      return parsed as AgentProgress;
    }
    // Legacy formats: { type: "status"|"review"|"report"|... }
    return convertLegacy(parsed);
  } catch {
    return null;
  }
}

export default function AgentStream({ content, onCancel, onApprove, onReject, onRequestChanges }: AgentStreamProps) {
  const progress = useMemo(() => parseProgress(content), [content]);

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
        {/* Stop button moved to send button in ChatInput */}
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

      {/* Report (when done or waiting for review) */}
      {(isDone || progress.status === "waiting") && progress.report && (
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

      {/* Review actions */}
      {progress.status === "waiting" && progress.report?.reviewId && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {onApprove && (
            <Btn primary sm onClick={() => onApprove(progress.report!.reviewId!)}>
              Godkjenn
            </Btn>
          )}
          {onRequestChanges && (
            <Btn sm onClick={() => onRequestChanges(progress.report!.reviewId!, "")}>
              Be om endringer
            </Btn>
          )}
          {onReject && (
            <Btn sm onClick={() => onReject(progress.report!.reviewId!)} style={{ color: T.error }}>
              Avvis
            </Btn>
          )}
        </div>
      )}

      {/* Concerns */}
      {progress.report?.concerns && progress.report.concerns.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Bekymringer</div>
          {progress.report.concerns.map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5, paddingLeft: 8, borderLeft: `2px solid ${T.border}`, marginBottom: 4 }}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
