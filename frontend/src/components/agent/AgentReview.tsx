"use client";

import { useState, useEffect, useRef } from "react";
import type { AgentPhaseProps } from "./types";
import { getPhaseTitle } from "./types";
import { StepList } from "./StepList";

/** Phase: review — waiting for user review approval */
export function AgentReview({ data, onApprove, onRequestChanges, onReject }: AgentPhaseProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [longWait, setLongWait] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewData = data.reviewData;

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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

  async function handleApprove() {
    if (!onApprove) return;
    setActionLoading("approve");
    setActionResult(null);
    setLongWait(false);

    // Start 15s timeout
    timerRef.current = setTimeout(() => {
      setLongWait(true);
    }, 15000);

    try {
      await onApprove(reviewData!.reviewId);
      setActionResult({ type: "success", message: "PR opprettet" });
      setActionDone(true);
    } catch (e: any) {
      setActionResult({ type: "error", message: e?.message || "Godkjenning feilet" });
    } finally {
      setActionLoading(null);
      setLongWait(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  }

  async function handleReject() {
    if (!onReject) return;
    setActionLoading("reject");
    setActionResult(null);
    setLongWait(false);
    try {
      await onReject(reviewData!.reviewId);
      setActionResult({ type: "success", message: "Review avvist" });
      setActionDone(true);
    } catch (e: any) {
      setActionResult({ type: "error", message: e?.message || "Avvisning feilet" });
    } finally {
      setActionLoading(null);
    }
  }

  const buttonsDisabled = !!actionLoading || actionDone;

  return (
    <div style={{ border: "1px solid var(--border)" }}>
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          Venter pa godkjenning
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
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs"
          style={{ color: "var(--accent)", display: "block" }}
        >
          Se detaljer
        </a>

        {/* Action result */}
        {actionResult && (
          <p className="text-xs" style={{ color: actionResult.type === "success" ? "#22c55e" : "#ef4444" }}>
            {actionResult.message}
          </p>
        )}

        {/* Long wait message */}
        {longWait && !actionResult && (
          <p className="text-xs animate-fadeIn" style={{ color: "var(--text-muted)" }}>
            Tar litt lenger enn vanlig...
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          {onApprove && (
            <button
              onClick={handleApprove}
              disabled={buttonsDisabled}
              className="text-xs px-3 py-1.5 font-medium flex items-center gap-1.5"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                opacity: buttonsDisabled ? 0.5 : 1,
              }}
            >
              {actionLoading === "approve" && (
                <span
                  className="w-3 h-3 border-2 rounded-full animate-spin inline-block"
                  style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
                />
              )}
              Godkjenn
            </button>
          )}
          {onRequestChanges && (
            <button
              onClick={() => onRequestChanges(reviewData.reviewId)}
              disabled={buttonsDisabled}
              className="text-xs px-3 py-1.5"
              style={{
                border: "1px solid var(--border)",
                color: buttonsDisabled ? "var(--text-muted)" : "var(--text-secondary)",
                background: "transparent",
                opacity: buttonsDisabled ? 0.5 : 1,
              }}
            >
              Be om endringer
            </button>
          )}
          {onReject && (
            <button
              onClick={handleReject}
              disabled={buttonsDisabled}
              className="text-xs px-3 py-1.5 flex items-center gap-1.5"
              style={{
                border: "1px solid #ef4444",
                color: "#ef4444",
                background: "transparent",
                opacity: buttonsDisabled ? 0.5 : 1,
              }}
            >
              {actionLoading === "reject" && (
                <span
                  className="w-3 h-3 border-2 rounded-full animate-spin inline-block"
                  style={{ borderColor: "rgba(239,68,68,0.3)", borderTopColor: "#ef4444" }}
                />
              )}
              Avvis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
