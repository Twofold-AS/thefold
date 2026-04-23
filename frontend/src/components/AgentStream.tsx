"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { T } from "@/lib/tokens";
import CheckIcon from "@/components/icons/CheckIcon";
import Btn from "@/components/Btn";
import { getReview } from "@/lib/api";
import AgentReasoningCard from "@/components/chat/AgentReasoningCard";
import ChangedFilesPanel, { type FileChange } from "@/components/chat/ChangedFilesPanel";
import ToolCallLine from "@/components/chat/ToolCallLine";
import ToolCallDetailModal from "@/components/chat/ToolCallDetailModal";
import SubAgentLine from "@/components/chat/SubAgentLine";
import ValidationPhaseLine from "@/components/chat/ValidationPhaseLine";
import StdoutStreamModal from "@/components/chat/StdoutStreamModal";
import type { ToolCallLineData, SwarmGroupLine, ValidationPhaseLine as ValidationPhaseLineData } from "@/components/chat/types";

interface StepInfo {
  id: string;
  label: string;
  done: boolean | null;
  /** Optional timestamp for chronological merge with tool calls (U3) */
  timestamp?: number;
}

interface AgentReport {
  // Backend sends Array<{path, action, diff?}>; legacy paths may send string[]
  filesChanged: Array<{ path: string; action?: string; diff?: string } | string>;
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
  /** U5 — tool-call-lines merged kronologisk med steps. */
  toolCalls?: ToolCallLineData[];
  /** Fase K.1 — Sandbox-validation-phases merged kronologisk med steps + tool-calls. */
  validations?: ValidationPhaseLineData[];
  question?: string;
  report?: AgentReport;
}

interface ReviewFileInfo {
  path: string;
  action: "create" | "modify" | "delete";
  content?: string;
}

type ReviewActionType = "approve" | "reject" | "changes" | null;

interface AgentStreamProps {
  content?: string;
  onCancel?: () => void;
  onApprove?: (reviewId: string) => void | Promise<void>;
  onReject?: (reviewId: string) => void | Promise<void>;
  onRequestChanges?: (reviewId: string, feedback: string) => void | Promise<void>;
  /** Page-level review action state — persists across re-renders */
  reviewInProgress?: ReviewActionType;
  /** Inline sub-agent swarm groups matched from swarm_status messages (Fase H refactor) */
  swarmGroups?: SwarmGroupLine[];
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
    case "project_review_ready":
      return {
        status: "waiting",
        phase: "reviewing",
        summary: parsed.summary || `${parsed.tasksCompleted || 0} oppgaver fullfort, ${parsed.filesChanged || 0} filer endret.`,
        steps: [
          { id: "tasks", label: `${parsed.tasksCompleted || 0} oppgaver fullfort`, done: true },
          { id: "files", label: `${parsed.filesChanged || 0} filer endret`, done: true },
          { id: "review", label: parsed.qualityScore != null ? `Kvalitet: ${parsed.qualityScore}/10` : "Gjennomgatt av AI", done: true },
          { id: "waiting", label: "Venter pa godkjenning", done: false },
        ],
        report: {
          filesChanged: [],
          costUsd: 0,
          duration: "",
          qualityScore: parsed.qualityScore,
          reviewId: parsed.reviewId || "",
        },
        question: parsed.message,
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

type MergedLine =
  | { kind: "step"; id: string; label: string; done: boolean | null; timestamp: number }
  | { kind: "tool"; data: ToolCallLineData; timestamp: number }
  | { kind: "swarm"; data: SwarmGroupLine; timestamp: number }
  | { kind: "validation"; data: ValidationPhaseLineData; timestamp: number };

export default function AgentStream({ content, onCancel, onApprove, onReject, onRequestChanges, reviewInProgress, swarmGroups }: AgentStreamProps) {
  const progress = useMemo(() => parseProgress(content), [content]);

  // Tool-call detail modal state (U3)
  const [openToolCall, setOpenToolCall] = useState<ToolCallLineData | null>(null);
  // Fase K.1/K.3 — stdout-stream modal state
  const [openStdout, setOpenStdout] = useState<{ sandboxId: string; phaseIndex?: number } | null>(null);

  // Merge steps + toolCalls + swarmGroups into one chronological stack
  // (U3/U8 + Fase H inline refactor). Swarm groups are appended at the tail
  // so they render below the most recent step/tool — they represent the
  // "currently running" swarm which should sit at the bottom of the stack.
  const mergedLines = useMemo<MergedLine[]>(() => {
    const lines: MergedLine[] = [];
    if (progress) {
      (progress.steps ?? []).forEach((s, i) => {
        lines.push({
          kind: "step",
          id: s.id,
          label: s.label,
          done: s.done,
          timestamp: s.timestamp ?? i, // fallback keeps input order
        });
      });
      (progress.toolCalls ?? []).forEach((t) => {
        lines.push({ kind: "tool", data: t, timestamp: t.timestamp });
      });
      // Fase K.1 — validation-phases merges kronologisk.
      (progress.validations ?? []).forEach((v) => {
        lines.push({ kind: "validation", data: v, timestamp: v.timestamp });
      });
    }
    (swarmGroups ?? []).forEach((g) => {
      lines.push({ kind: "swarm", data: g, timestamp: g.timestamp });
    });
    lines.sort((a, b) => a.timestamp - b.timestamp);
    return lines;
  }, [progress, swarmGroups]);

  // Use page-level reviewInProgress (survives re-renders) with local fallback
  const reviewAction = reviewInProgress ?? null;

  // Fetched file list for Bug C — loaded on demand when review message appears
  const [reviewFiles, setReviewFiles] = useState<ReviewFileInfo[] | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const reviewId = progress?.report?.reviewId;
  const reviewFetchAttempts = useRef(0);
  useEffect(() => {
    if (!reviewId || reviewFiles !== null) return;
    reviewFetchAttempts.current = 0;

    const fetchFiles = () => {
      getReview(reviewId)
        .then(({ review }) => {
          const files = Array.isArray(review.filesChanged) ? review.filesChanged : [];
          setReviewFiles(files as ReviewFileInfo[]);
        })
        .catch(() => {
          reviewFetchAttempts.current += 1;
          if (reviewFetchAttempts.current < 3) {
            // Retry up to 2 times with increasing delay (review data may not be ready yet)
            setTimeout(fetchFiles, reviewFetchAttempts.current * 2000);
          } else {
            setReviewFiles([]); // give up after 3 attempts — buttons still work
          }
        });
    };
    fetchFiles();
  }, [reviewId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async () => {
    if (!reviewId || reviewAction) return;
    await onApprove?.(reviewId);
  };
  const handleReject = async () => {
    if (!reviewId || reviewAction) return;
    await onReject?.(reviewId);
  };
  const handleRequestChanges = async () => {
    if (!reviewId || reviewAction) return;
    onRequestChanges?.(reviewId, "");
  };

  const toggleFile = (path: string) =>
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });

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

      {/* Steps + tool-calls + swarm-groups + validations merged chronologically (U3 + Fase H + Fase K) */}
      {((progress.steps && progress.steps.length > 0) || (progress.toolCalls && progress.toolCalls.length > 0) || (swarmGroups && swarmGroups.length > 0) || (progress.validations && progress.validations.length > 0)) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 4 }}>
          {mergedLines.map((line, idx) =>
            line.kind === "step" ? (
              <div
                key={`step-${line.id}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "3px 0",
                }}
              >
                {line.done === true ? (
                  <CheckIcon color={T.success} size={12} />
                ) : line.done === null ? (
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
                      line.done === true
                        ? T.textMuted
                        : line.done === null
                          ? T.textSec
                          : T.textFaint,
                  }}
                >
                  {line.label}
                </span>
              </div>
            ) : line.kind === "tool" ? (
              <ToolCallLine key={`tool-${line.data.id}-${idx}`} data={line.data} onClick={setOpenToolCall} />
            ) : line.kind === "swarm" ? (
              <SubAgentLine key={`swarm-${line.data.id}-${idx}`} group={line.data} />
            ) : (
              // Fase K.1 — validation-phase line med Terminal-knapp som åpner stdout-modal
              <ValidationPhaseLine
                key={`val-${line.data.id}-${idx}`}
                data={line.data}
                onOpenStdout={(sandboxId, phaseIndex) => {
                  if (sandboxId) setOpenStdout({ sandboxId, phaseIndex });
                }}
              />
            )
          )}
        </div>
      )}

      {/* Detail modal for clicked tool-calls */}
      <ToolCallDetailModal data={openToolCall} onClose={() => setOpenToolCall(null)} />

      {/* Fase K.3 — Live-stdout-stream modal åpnes fra ValidationPhaseLine */}
      {openStdout && (
        <StdoutStreamModal
          sandboxId={openStdout.sandboxId}
          initialPhaseIndex={openStdout.phaseIndex}
          onClose={() => setOpenStdout(null)}
        />
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
              {reviewFiles != null ? reviewFiles.length : progress.report.filesChanged.length}
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

      {/* File list (Bug C) */}
      {progress.status === "waiting" && reviewId && reviewFiles && reviewFiles.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.05em" }}>
            Endrede filer ({reviewFiles.length})
          </div>
          {reviewFiles.map(f => (
            <div key={f.path} style={{ marginBottom: 4 }}>
              <div
                onClick={() => f.content ? toggleFile(f.path) : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px",
                  background: T.subtle,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  cursor: f.content ? "pointer" : "default",
                  userSelect: "none",
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                  color: f.action === "create" ? T.success : f.action === "delete" ? T.error : T.warning,
                  background: f.action === "create" ? "rgba(34,197,94,0.1)" : f.action === "delete" ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)",
                }}>
                  {f.action === "create" ? "+" : f.action === "delete" ? "−" : "~"}
                </span>
                <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec, flex: 1 }}>{f.path}</span>
                {f.content && (
                  <span style={{ fontSize: 10, color: T.textFaint }}>{expandedFiles.has(f.path) ? "▲" : "▼"}</span>
                )}
              </div>
              {f.content && expandedFiles.has(f.path) && (
                <pre style={{
                  margin: 0, padding: "10px 12px",
                  background: T.subtle,
                  border: `1px solid ${T.border}`, borderTop: "none",
                  borderRadius: "0 0 4px 4px",
                  fontSize: 11, fontFamily: T.mono, color: T.textSec,
                  lineHeight: 1.5, overflowX: "auto", maxHeight: 300, overflowY: "auto",
                  whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>
                  {f.content}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review action buttons (Bug A — with loading states) */}
      {progress.status === "waiting" && reviewId && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {onApprove && (
            <Btn
              primary
              sm
              onClick={handleApprove}
              disabled={reviewAction !== null}
            >
              {reviewAction === "approve" ? "Godkjenner..." : "Godkjenn ✓"}
            </Btn>
          )}
          {onRequestChanges && (
            <Btn
              sm
              onClick={handleRequestChanges}
              disabled={reviewAction !== null}
            >
              Be om endringer
            </Btn>
          )}
          {onReject && (
            <Btn
              sm
              onClick={handleReject}
              disabled={reviewAction !== null}
              style={{ color: reviewAction === "reject" ? T.textFaint : T.error }}
            >
              {reviewAction === "reject" ? "Avviser..." : "Avvis"}
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

      {/* Agent reasoning transparency — shows memories, skills, context, decisions */}
      <AgentReasoningCard
        reasoning={{
          memoriesUsed: (progress as any)?.reasoning?.memoriesUsed,
          skillsUsed: (progress as any)?.reasoning?.skillsUsed,
          contextFiles: (progress as any)?.reasoning?.contextFiles,
          decisions: (progress as any)?.reasoning?.decisions,
          modelUsed: (progress as any)?.reasoning?.modelUsed,
          confidenceScore: (progress as any)?.reasoning?.confidenceScore,
          complexityScore: (progress as any)?.reasoning?.complexityScore,
        }}
        thinkingText={(progress as any)?.reasoning?.thinkingText || (progress as any)?.thinking}
      />
    </div>
  );
}
