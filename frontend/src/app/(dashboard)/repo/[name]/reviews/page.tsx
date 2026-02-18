"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { listReviews, deleteReview, cleanupReviews, type ReviewSummary } from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const STATUS_TABS = [
  { key: "", label: "Alle" },
  { key: "pending", label: "Venter" },
  { key: "approved", label: "Godkjent" },
  { key: "changes_requested", label: "Endringer" },
  { key: "rejected", label: "Avvist" },
];

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
    changes_requested: "Endringer",
    rejected: "Avvist",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {labels[status] || status}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export default function RepoReviewsPage() {
  const params = useParams<{ name: string }>();
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listReviews({
        status: statusFilter || undefined,
        limit: 50,
      });
      setReviews(res.reviews);
      setTotal(res.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter, params.name]);

  async function handleDelete(reviewId: string) {
    setDeleting(reviewId);
    setConfirmDelete(null);
    try {
      await deleteReview(reviewId);
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      setTotal((prev) => prev - 1);
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  async function handleCleanup() {
    setCleaningUp(true);
    setConfirmCleanup(false);
    try {
      await cleanupReviews();
      await load();
    } catch {
      // silent
    } finally {
      setCleaningUp(false);
    }
  }

  return (
    <div>
      <PageHeaderBar
        title="Reviews"
        subtitle={params.name}
        rightCells={[
          {
            content: (
              <button
                onClick={() => setConfirmCleanup(true)}
                disabled={cleaningUp}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {cleaningUp ? "Rydder..." : "Rydd opp"}
              </button>
            ),
          },
        ]}
      />

      <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {total} review{total !== 1 ? "s" : ""} totalt
      </p>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1" style={{ background: "var(--bg-secondary)" }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: statusFilter === tab.key ? "var(--bg-card)" : "transparent",
              color: statusFilter === tab.key ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Confirm cleanup dialog */}
      {confirmCleanup && (
        <div
          className="p-4 flex items-center justify-between"
          style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)" }}
        >
          <span className="text-xs" style={{ color: "var(--text-primary)" }}>
            Slett alle ventende reviews eldre enn 24 timer?
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmCleanup(false)}
              className="px-3 py-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Avbryt
            </button>
            <button
              onClick={handleCleanup}
              className="px-3 py-1 text-xs font-medium"
              style={{ background: "#eab308", color: "#000" }}
            >
              Bekreft
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--text-secondary)" }}
          />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
          <p className="text-sm">Ingen reviews funnet</p>
          <p className="text-xs mt-1">Reviews opprettes automatisk nar agenten har fullfort en oppgave.</p>
        </div>
      ) : (
        <div
          className="overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", minWidth: 0 }}
        >
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)", width: "40%" }}>
                  Task
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)", width: "10%" }}>
                  Filer
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)", width: "12%" }}>
                  Kvalitet
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)", width: "13%" }}>
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)", width: "15%" }}>
                  Opprettet
                </th>
                <th className="px-2 py-3" style={{ width: "10%" }} />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/review/${r.id}`}
                      className="font-mono text-xs hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {r.taskId.substring(0, 24)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
                    {r.fileCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.qualityScore !== null ? (
                      <span
                        className="text-xs font-medium"
                        style={{
                          color:
                            r.qualityScore >= 7 ? "#22c55e" : r.qualityScore >= 5 ? "#eab308" : "#ef4444",
                        }}
                      >
                        {r.qualityScore}/10
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(r.createdAt).toLocaleDateString("nb-NO")}
                  </td>
                  <td className="px-2 py-3 text-center" style={{ overflow: "hidden" }}>
                    {confirmDelete === r.id ? (
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
                        >
                          Ja
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-1.5 py-0.5 text-[10px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Nei
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(r.id)}
                        disabled={deleting === r.id}
                        className="p-1 transition-colors opacity-40 hover:opacity-100"
                        style={{ color: "var(--text-muted)" }}
                        title="Slett review"
                      >
                        {deleting === r.id ? (
                          <span className="text-[10px]">...</span>
                        ) : (
                          <TrashIcon />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
