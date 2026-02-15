"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getReview,
  approveReview,
  requestReviewChanges,
  rejectReview,
  type CodeReview,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(234,179,8,0.15)", text: "#eab308" },
    approved: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    changes_requested: { bg: "rgba(249,115,22,0.15)", text: "#f97316" },
    rejected: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  };
  const c = colors[status] || colors.pending;
  const labels: Record<string, string> = {
    pending: "Venter",
    approved: "Godkjent",
    changes_requested: "Endringer etterspurt",
    rejected: "Avvist",
  };

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {labels[status] || status}
    </span>
  );
}

function FileIcon({ action }: { action: string }) {
  const colors: Record<string, string> = {
    create: "#22c55e",
    modify: "#eab308",
    delete: "#ef4444",
  };
  return (
    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: colors[action] || "#888" }}>
      {action === "create" ? "A" : action === "delete" ? "D" : "M"}
    </span>
  );
}

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params.id as string;

  const [review, setReview] = useState<CodeReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await getReview(reviewId);
        setReview(res.review);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Feil ved lasting");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reviewId]);

  async function handleApprove() {
    setActionLoading(true);
    try {
      const res = await approveReview(reviewId);
      setReview((r) => r ? { ...r, status: "approved", prUrl: res.prUrl } : r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) return;
    setActionLoading(true);
    try {
      await requestReviewChanges(reviewId, feedback);
      setReview((r) => r ? { ...r, status: "changes_requested", feedback } : r);
      setFeedback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    setActionLoading(true);
    try {
      await rejectReview(reviewId, feedback || undefined);
      setReview((r) => r ? { ...r, status: "rejected" } : r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feil");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeaderBar title="Review" />
        <div className="p-6 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
          Laster review...
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div>
        <PageHeaderBar title="Review" />
        <div className="p-6">
          <div className="p-4" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
            {error || "Review ikke funnet"}
          </div>
        </div>
      </div>
    );
  }

  const currentFile = review.filesChanged[selectedFile];

  return (
    <div>
      <PageHeaderBar title="Review" />
      <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/review")}
            className="text-xs mb-2 flex items-center gap-1"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Tilbake til reviews
          </button>
          <h2 className="text-xl font-semibold font-display" style={{ color: "var(--text-primary)" }}>
            Review: {review.taskId.substring(0, 20)}
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {new Date(review.createdAt).toLocaleString("nb-NO")}
          </p>
        </div>
        <StatusBadge status={review.status} />
      </div>

      {/* AI Review Summary */}
      {review.aiReview && (
        <div className="p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-medium font-display mb-3" style={{ color: "var(--text-primary)" }}>
            AI Review
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Kvalitet</span>
              <div className="text-2xl font-semibold" style={{ color: review.aiReview.qualityScore >= 7 ? "#22c55e" : review.aiReview.qualityScore >= 5 ? "#eab308" : "#ef4444" }}>
                {review.aiReview.qualityScore}/10
              </div>
            </div>
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Filer endret</span>
              <div className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {review.filesChanged.length}
              </div>
            </div>
          </div>

          {review.aiReview.concerns.length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-medium" style={{ color: "#f97316" }}>Bekymringer</span>
              <ul className="mt-1 space-y-1">
                {review.aiReview.concerns.map((c, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    - {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 text-xs" style={{ color: "var(--text-secondary)" }}>
            <details>
              <summary className="cursor-pointer" style={{ color: "var(--text-muted)" }}>Dokumentasjon</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs p-3 rounded" style={{ background: "var(--bg-secondary)" }}>
                {review.aiReview.documentation}
              </pre>
            </details>
          </div>
        </div>
      )}

      {/* File Viewer */}
      <div className="overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {/* File tabs */}
        <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }}>
          {review.filesChanged.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelectedFile(i)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono whitespace-nowrap"
              style={{
                background: i === selectedFile ? "var(--bg-secondary)" : "transparent",
                color: i === selectedFile ? "var(--text-primary)" : "var(--text-muted)",
                borderBottom: i === selectedFile ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              <FileIcon action={f.action} />
              {f.path}
            </button>
          ))}
        </div>

        {/* File content */}
        {currentFile && (
          <div className="overflow-x-auto">
            <pre
              className="p-4 text-xs leading-5 font-mono"
              style={{
                color: "var(--text-secondary)",
                background: currentFile.action === "delete" ? "rgba(239,68,68,0.05)" : "transparent",
              }}
            >
              {currentFile.content || "(tom fil)"}
            </pre>
          </div>
        )}
      </div>

      {/* PR link */}
      {review.prUrl && (
        <div className="p-4" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <a
            href={review.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium"
            style={{ color: "#22c55e" }}
          >
            PR opprettet: {review.prUrl}
          </a>
        </div>
      )}

      {/* Actions */}
      {(review.status === "pending" || review.status === "changes_requested") && (
        <div className="p-5 space-y-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-medium font-display" style={{ color: "var(--text-primary)" }}>
            Handlinger
          </h2>

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tilbakemelding (valgfritt for godkjenning, påkrevd for endringer)..."
            rows={3}
            className="w-full p-3 text-sm resize-none input-field"
          />

          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="btn-primary"
            >
              Godkjenn
            </button>
            <button
              onClick={handleRequestChanges}
              disabled={actionLoading || !feedback.trim()}
              className="btn-secondary"
            >
              Be om endringer
            </button>
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="btn-danger"
            >
              Avvis
            </button>
          </div>
        </div>
      )}

      {/* Feedback display */}
      {review.feedback && review.status !== "pending" && (
        <div className="p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tilbakemelding</span>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{review.feedback}</p>
        </div>
      )}
      </div>
    </div>
  );
}
