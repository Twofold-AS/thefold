"use client";

import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";

export interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export interface AgentProgressData {
  phase: string;
  title: string;
  steps: ProgressStep[];
  error?: string;
  reviewData?: {
    reviewId: string;
    qualityScore?: number;
    concerns?: string[];
    documentation?: string;
    filesChanged?: Array<{ path: string; action: string }>;
  };
  taskId?: string;
}

interface AgentProgressCardProps {
  data: AgentProgressData;
  onApprove?: (reviewId: string) => void;
  onRequestChanges?: (reviewId: string) => void;
  onReject?: (reviewId: string) => void;
  onCancel?: (taskId: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  Forbereder: "Preparing",
  Analyserer: "Analyzing",
  Planlegger: "Planning",
  Bygger: "Building",
  Reviewer: "Reviewing",
  Venter: "Waiting",
  Ferdig: "Complete",
  Feilet: "Failed",
  Stopped: "Stopped",
};

export function AgentProgressCard({
  data,
  onApprove,
  onRequestChanges,
  onReject,
  onCancel,
}: AgentProgressCardProps) {
  const [expanded, setExpanded] = useState(true);
  const isTerminal = ["Ferdig", "Feilet", "Stopped", "completed", "failed"].includes(data.phase);
  const isWaiting = data.phase === "Venter";
  const isError = ["Feilet", "failed"].includes(data.phase);
  const isComplete = ["Ferdig", "completed"].includes(data.phase);

  const phaseLabel = PHASE_LABELS[data.phase] || data.phase;
  const doneCount = data.steps.filter((s) => s.status === "done").length;
  const totalSteps = data.steps.length;

  return (
    <div
      className="rounded-xl overflow-hidden animate-message-enter"
      style={{
        background: "var(--tf-surface)",
        border: `1px solid ${
          isError
            ? "var(--tf-error)"
            : isComplete
              ? "var(--tf-success)"
              : isWaiting
                ? "var(--tf-warning)"
                : "var(--tf-border-muted)"
        }`,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
        style={{ background: "transparent" }}
      >
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: isError
                ? "var(--tf-error)"
                : isComplete
                  ? "var(--tf-success)"
                  : isWaiting
                    ? "var(--tf-warning)"
                    : "var(--tf-heat)",
              animation: !isTerminal && !isWaiting ? "pulse 2s infinite" : "none",
            }}
          />

          <div className="text-left">
            <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
              {data.title || phaseLabel}
            </span>
            {totalSteps > 0 && (
              <span className="text-xs ml-2" style={{ color: "var(--tf-text-faint)" }}>
                {doneCount}/{totalSteps}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isTerminal && !isWaiting && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--tf-heat)" }} />
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--tf-text-faint)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--tf-text-faint)" }} />
          )}
        </div>
      </button>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="h-0.5 mx-4" style={{ background: "var(--tf-border-faint)" }}>
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${(doneCount / totalSteps) * 100}%`,
              background: isError ? "var(--tf-error)" : isComplete ? "var(--tf-success)" : "var(--tf-heat)",
            }}
          />
        </div>
      )}

      {/* Steps */}
      {expanded && data.steps.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          {data.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {step.status === "done" ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--tf-success)" }} />
              ) : step.status === "active" ? (
                <Loader2
                  className="w-3.5 h-3.5 flex-shrink-0 animate-spin"
                  style={{ color: "var(--tf-heat)" }}
                />
              ) : step.status === "error" ? (
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--tf-error)" }} />
              ) : (
                <Circle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--tf-text-faint)" }} />
              )}
              <span
                className="text-xs"
                style={{
                  color:
                    step.status === "active"
                      ? "var(--tf-text-primary)"
                      : step.status === "done"
                        ? "var(--tf-text-secondary)"
                        : "var(--tf-text-faint)",
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {expanded && data.error && (
        <div
          className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs"
          style={{
            background: "rgba(235, 52, 36, 0.06)",
            color: "var(--tf-error)",
            border: "1px solid rgba(235, 52, 36, 0.15)",
          }}
        >
          {data.error}
        </div>
      )}

      {/* Review section */}
      {expanded && data.reviewData && (
        <div
          className="mx-4 mb-3 rounded-lg p-3 space-y-3"
          style={{ background: "var(--tf-bg-base)", border: "1px solid var(--tf-border-faint)" }}
        >
          {/* Quality score */}
          {data.reviewData.qualityScore != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                Quality score
              </span>
              <span
                className="text-sm font-mono font-medium"
                style={{
                  color:
                    data.reviewData.qualityScore >= 7
                      ? "var(--tf-success)"
                      : data.reviewData.qualityScore >= 4
                        ? "var(--tf-warning)"
                        : "var(--tf-error)",
                }}
              >
                {data.reviewData.qualityScore}/10
              </span>
            </div>
          )}

          {/* Files changed */}
          {data.reviewData.filesChanged && data.reviewData.filesChanged.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--tf-text-faint)" }}>
                Files changed
              </span>
              <div className="mt-1 space-y-1">
                {data.reviewData.filesChanged.slice(0, 8).map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="text-[10px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background:
                          f.action === "create"
                            ? "var(--tf-success)"
                            : f.action === "delete"
                              ? "var(--tf-error)"
                              : "var(--tf-warning)",
                      }}
                    />
                    <span className="text-xs font-mono truncate" style={{ color: "var(--tf-text-secondary)" }}>
                      {f.path}
                    </span>
                  </div>
                ))}
                {data.reviewData.filesChanged.length > 8 && (
                  <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                    +{data.reviewData.filesChanged.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Concerns */}
          {data.reviewData.concerns && data.reviewData.concerns.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--tf-text-faint)" }}>
                Concerns
              </span>
              <ul className="mt-1 space-y-1">
                {data.reviewData.concerns.map((c, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--tf-warning)" }} />
                    <span style={{ color: "var(--tf-text-secondary)" }}>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          {(onApprove || onRequestChanges || onReject) && data.reviewData.reviewId && (
            <div className="flex items-center gap-2 pt-1">
              {onApprove && (
                <button
                  onClick={() => onApprove(data.reviewData!.reviewId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: "var(--tf-success)",
                    color: "white",
                  }}
                >
                  <ThumbsUp className="w-3 h-3" />
                  Approve
                </button>
              )}
              {onRequestChanges && (
                <button
                  onClick={() => onRequestChanges(data.reviewData!.reviewId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: "rgba(236, 183, 48, 0.1)",
                    color: "var(--tf-warning)",
                    border: "1px solid rgba(236, 183, 48, 0.2)",
                  }}
                >
                  <MessageSquare className="w-3 h-3" />
                  Changes
                </button>
              )}
              {onReject && (
                <button
                  onClick={() => onReject(data.reviewData!.reviewId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: "rgba(235, 52, 36, 0.08)",
                    color: "var(--tf-error)",
                    border: "1px solid rgba(235, 52, 36, 0.15)",
                  }}
                >
                  <ThumbsDown className="w-3 h-3" />
                  Reject
                </button>
              )}
              {data.reviewData.reviewId && (
                <a
                  href={`/review/${data.reviewData.reviewId}`}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ml-auto"
                  style={{ color: "var(--tf-text-faint)" }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Full review
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cancel button for active tasks */}
      {!isTerminal && onCancel && data.taskId && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onCancel(data.taskId!)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: "var(--tf-text-faint)" }}
          >
            Cancel task
          </button>
        </div>
      )}
    </div>
  );
}
