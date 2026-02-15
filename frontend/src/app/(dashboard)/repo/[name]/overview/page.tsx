"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  getRepoTree,
  getMonitorHealth,
  listTheFoldTasks,
  listReviews,
  listAuditLog,
  type TheFoldTask,
  type ReviewSummary,
  type AuditLogEntry,
} from "@/lib/api";
import { useRepoContext } from "@/lib/repo-context";
import { PageHeaderBar } from "@/components/PageHeaderBar";

export default function RepoOverviewPage() {
  const params = useParams<{ name: string }>();
  const pathname = usePathname();
  const { selectedRepo } = useRepoContext();
  const [fileCount, setFileCount] = useState(0);
  const [healthStatus, setHealthStatus] = useState<string>("unknown");
  const [healthChecks, setHealthChecks] = useState<Array<{ checkType: string; status: string }>>([]);
  const [tasks, setTasks] = useState<TheFoldTask[]>([]);
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const owner = selectedRepo?.owner || "Twofold-AS";

    Promise.all([
      getRepoTree(owner, params.name).catch(() => ({ tree: [], treeString: "" })),
      getMonitorHealth().catch(() => ({ repos: {} })),
      listTheFoldTasks({ repo: params.name, limit: 10 }).catch(() => ({ tasks: [], total: 0 })),
      listReviews({ limit: 5 }).catch(() => ({ reviews: [], total: 0 })),
      listAuditLog({ repoName: params.name, limit: 5 }).catch(() => ({ entries: [], total: 0 })),
    ]).then(([treeRes, healthRes, tasksRes, reviewsRes, auditRes]) => {
      setFileCount(treeRes.tree.length);

      // Health
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const repoHealth = ((healthRes.repos as any)?.[params.name] || []) as Array<{ checkType: string; status: string }>;
      setHealthChecks(repoHealth.map((h) => ({ checkType: h.checkType, status: h.status })));
      if (repoHealth.length === 0) {
        setHealthStatus("unknown");
      } else if (repoHealth.every((h) => h.status === "pass")) {
        setHealthStatus("healthy");
      } else if (repoHealth.some((h) => h.status === "fail")) {
        setHealthStatus("error");
      } else {
        setHealthStatus("warning");
      }

      setTasks(tasksRes.tasks);
      setReviews(reviewsRes.reviews);
      setRecentActivity(auditRes.entries.slice(0, 5));
    }).finally(() => setLoading(false));
  }, [params.name, selectedRepo]);

  const activeTasks = tasks.filter((t) => t.status !== "done" && t.status !== "blocked");
  const healthColor = healthStatus === "healthy" ? "#22c55e" : healthStatus === "error" ? "#ef4444" : healthStatus === "warning" ? "#eab308" : "var(--text-muted)";
  const healthLabel = healthStatus === "healthy" ? "Alt OK" : healthStatus === "error" ? "Feil oppdaget" : healthStatus === "warning" ? "Advarsler" : "Ukjent";

  if (loading) {
    return (
      <div>
        <PageHeaderBar
          title={params.name}
          cells={[
            { label: "Oversikt", href: `/repo/${params.name}/overview`, active: pathname.includes("/overview") },
            { label: "Chat", href: `/repo/${params.name}/chat`, active: pathname.includes("/chat") },
            { label: "Oppgaver", href: `/repo/${params.name}/tasks`, active: pathname.includes("/tasks") },
            { label: "Reviews", href: `/repo/${params.name}/reviews`, active: pathname.includes("/reviews") },
            { label: "Aktivitet", href: `/repo/${params.name}/activity`, active: pathname.includes("/activity") },
          ]}
        />
        <div className="flex items-center justify-center py-20">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--text-secondary)" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeaderBar
        title={params.name}
        cells={[
          { label: "Oversikt", href: `/repo/${params.name}/overview`, active: pathname.includes("/overview") },
          { label: "Chat", href: `/repo/${params.name}/chat`, active: pathname.includes("/chat") },
          { label: "Oppgaver", href: `/repo/${params.name}/tasks`, active: pathname.includes("/tasks") },
          { label: "Reviews", href: `/repo/${params.name}/reviews`, active: pathname.includes("/reviews") },
          { label: "Aktivitet", href: `/repo/${params.name}/activity`, active: pathname.includes("/activity") },
        ]}
      />

      <div className="p-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <StatCard label="Repo-helse" value={healthLabel} color={healthColor} />
        <StatCard label="Filer" value={String(fileCount)} color="var(--text-primary)" />
        <StatCard label="Aktive oppgaver" value={String(activeTasks.length)} color="#3b82f6" />
        <StatCard label="Reviews" value={String(reviews.length)} color="#a855f7" />
      </div>

      {/* Health checks */}
      {healthChecks.length > 0 && (
        <div className="card mt-6">
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Helsestatus
          </h2>
          <div className="flex flex-wrap gap-3">
            {healthChecks.map((h) => (
              <div key={h.checkType} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background:
                      h.status === "pass" ? "#22c55e" : h.status === "fail" ? "#ef4444" : "#eab308",
                  }}
                />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {h.checkType.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Active tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Aktive oppgaver
            </h2>
            <Link href={`/repo/${params.name}/tasks`} className="text-[11px]" style={{ color: "var(--accent)" }}>
              Se alle
            </Link>
          </div>
          {activeTasks.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
              Ingen aktive oppgaver
            </p>
          ) : (
            <div className="space-y-2">
              {activeTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 py-1.5"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background:
                        task.status === "in_progress"
                          ? "#3b82f6"
                          : task.status === "in_review"
                            ? "#f97316"
                            : "var(--text-muted)",
                    }}
                  />
                  <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                    {task.title}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent reviews */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Siste reviews
            </h2>
            <Link href={`/repo/${params.name}/reviews`} className="text-[11px]" style={{ color: "var(--accent)" }}>
              Se alle
            </Link>
          </div>
          {reviews.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
              Ingen reviews enn&aring;
            </p>
          ) : (
            <div className="space-y-2">
              {reviews.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 py-1.5"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <StatusDot status={r.status} />
                  <Link
                    href={`/review/${r.id}`}
                    className="text-xs flex-1 truncate hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {r.taskId.substring(0, 20)}
                  </Link>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {r.fileCount} filer
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Siste aktivitet
          </h2>
          <Link href={`/repo/${params.name}/activity`} className="text-[11px]" style={{ color: "var(--accent)" }}>
            Se alle
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
            Ingen aktivitet enn&aring;
          </p>
        ) : (
          <div className="space-y-1">
            {recentActivity.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 py-1.5 text-xs"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)", minWidth: "40px" }}>
                  {new Date(e.timestamp).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                  {e.actionType.replace(/_/g, " ")}
                </span>
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: e.success === false ? "#ef4444" : "#22c55e" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mt-6">
        <Link
          href={`/repo/${params.name}/tasks`}
          className="btn-primary text-sm"
          onClick={(e) => {
            // Navigate via button
          }}
        >
          Ny oppgave
        </Link>
        <Link href={`/repo/${params.name}/chat`} className="btn-secondary text-sm">
          &Aring;pne chat
        </Link>
      </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-lg font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "#eab308",
    approved: "#22c55e",
    changes_requested: "#f97316",
    rejected: "#ef4444",
  };
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: colors[status] || "var(--text-muted)" }}
    />
  );
}
