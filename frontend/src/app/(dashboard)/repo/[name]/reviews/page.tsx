"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { listReviews, type ReviewSummary } from "@/lib/api";
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

export default function RepoReviewsPage() {
  const params = useParams<{ name: string }>();
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await listReviews({
          status: statusFilter || undefined,
          limit: 50,
        });
        // Filter client-side by repo (taskId often contains repo name)
        // The backend doesn't have a repo filter yet, so we show all
        setReviews(res.reviews);
        setTotal(res.total);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [statusFilter, params.name]);

  return (
    <div>
      <PageHeaderBar
        title="Reviews"
        subtitle={params.name}
      />

      <div className="p-6">
      {/* Filter tabs */}
      <div className="flex gap-1 p-1 mt-6" style={{ background: "var(--bg-secondary)" }}>
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
          <p className="text-xs mt-1">Reviews opprettes automatisk n&aring;r agenten har fullf&oslash;rt en oppgave.</p>
        </div>
      ) : (
        <div
          className="overflow-hidden mt-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Task
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Filer
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Kvalitet
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Opprettet
                </th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
