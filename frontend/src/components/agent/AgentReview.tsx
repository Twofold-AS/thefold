"use client";

import { useState } from "react";
import type { AgentPhaseProps } from "./types";
import { getPhaseTitle } from "./types";
import { StepList } from "./StepList";

/** Phase: review — waiting for user review approval */
export function AgentReview({ data, onApprove, onRequestChanges, onReject }: AgentPhaseProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const reviewData = data.reviewData;

  if (!reviewData) {
    return (
      <div style={{ border: "1px solid var(--border)" }}>
        <div className="px-4 py-3">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            {getPhaseTitle("Reviewer")}
          </span>
        </div>
        <StepList steps={data.steps} />
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)" }}>
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          Venter på godkjenning
        </span>
      </div>

      <StepList steps={data.steps} />

      {/* Review summary + action buttons */}
      <div
        className="px-4 py-3 space-y-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Kvalitet: {reviewData.quality}/10 · {reviewData.filesChanged} fil
          {reviewData.filesChanged > 1 ? "er" : ""} endret
        </p>
        {reviewData.concerns.length > 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {reviewData.concerns[0].substring(0, 120)}
            {reviewData.concerns.length > 1
              ? ` (+${reviewData.concerns.length - 1} til)`
              : ""}
          </p>
        )}
        <a
          href={reviewData.reviewUrl}
          className="text-xs"
          style={{ color: "var(--accent)", display: "block" }}
        >
          Se fullstendig review
        </a>
        <div className="flex items-center gap-2 pt-1">
          {onApprove && (
            <button
              onClick={async () => {
                setActionLoading(true);
                await onApprove(reviewData.reviewId);
                setActionLoading(false);
              }}
              disabled={actionLoading}
              className="text-xs px-3 py-1.5 font-medium"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                opacity: actionLoading ? 0.5 : 1,
              }}
            >
              Godkjenn
            </button>
          )}
          {onRequestChanges && (
            <button
              onClick={() => onRequestChanges(reviewData.reviewId)}
              disabled={actionLoading}
              className="text-xs px-3 py-1.5"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                background: "transparent",
              }}
            >
              Be om endringer
            </button>
          )}
          {onReject && (
            <button
              onClick={async () => {
                setActionLoading(true);
                await onReject(reviewData.reviewId);
                setActionLoading(false);
              }}
              disabled={actionLoading}
              className="text-xs px-3 py-1.5"
              style={{
                border: "1px solid #ef4444",
                color: "#ef4444",
                background: "transparent",
                opacity: actionLoading ? 0.5 : 1,
              }}
            >
              Avvis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
