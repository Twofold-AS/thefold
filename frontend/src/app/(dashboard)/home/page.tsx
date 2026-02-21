"use client";

import { useEffect, useState } from "react";
import {
  getTasks,
  getCacheStats,
  getMemoryStats,
  getAuditStats,
  listAuditLog,
  listRepos,
  getMonitorHealth,
  type LinearTask,
  type AuditLogEntry,
} from "@/lib/api";
import { useUser } from "@/contexts/UserPreferencesContext";


function CrowIcon() {
  return (
    <svg className="inline-block w-4 h-4 ml-1.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--text-secondary)" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 18c1-2 3-3 5-3 1.5 0 2.5.5 3 1l2-4c.5-1 1.5-2 3-2.5 1-.3 2.5-.3 3.5.5l.5.5-1 1c-.5.5-1.5.8-2.5.5l-1.5 3c-.5 1-1.5 2-3 2.5L10 18M7 9c0-2 1.5-4 4-5 1-.4 2-.4 3 0l1 .5-.5 1c-.5.5-1.5.5-2 0-.8-.3-1.7-.2-2.5.3C9 6.8 8.5 7.8 8.5 9c0 .5.1 1 .3 1.5" />
    </svg>
  );
}

interface DashboardData {
  tasks: LinearTask[];
  repoCount: number;
  cacheHitRate: number;
  cacheTotalEntries: number;
  memoryTotal: number;
  memoryExpiring: number;
  auditTotalTasks: number;
  auditSuccessRate: number;
  auditAvgDuration: number;
  recentActivity: AuditLogEntry[];
  monitorHealthy: number;
  monitorWarnings: number;
  monitorFailing: number;
}

export default function HomePage() {
  const { user } = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [tasksRes, cacheRes, memoryRes, auditRes, activityRes, reposRes, healthRes] = await Promise.allSettled([
          getTasks(),
          getCacheStats(),
          getMemoryStats(),
          getAuditStats(),
          listAuditLog({ limit: 5 }),
          listRepos("Twofold-AS"),
          getMonitorHealth(),
        ]);

        const tasks = tasksRes.status === "fulfilled" ? tasksRes.value.tasks : [];
        const cache = cacheRes.status === "fulfilled" ? cacheRes.value : null;
        const memory = memoryRes.status === "fulfilled" ? memoryRes.value : null;
        const audit = auditRes.status === "fulfilled" ? auditRes.value : null;
        const activity = activityRes.status === "fulfilled" ? activityRes.value.entries : [];
        const repos = reposRes.status === "fulfilled" ? reposRes.value.repos : [];
        const health = healthRes.status === "fulfilled" ? healthRes.value.repos : {};

        // Count health check statuses
        let healthy = 0, warnings = 0, failing = 0;
        for (const checks of Object.values(health)) {
          for (const c of checks) {
            if (c.status === "pass") healthy++;
            else if (c.status === "warn") warnings++;
            else failing++;
          }
        }

        setData({
          tasks,
          repoCount: repos.length,
          cacheHitRate: cache?.hitRate ?? 0,
          cacheTotalEntries: cache?.totalEntries ?? 0,
          memoryTotal: memory?.total ?? 0,
          memoryExpiring: memory?.expiringSoon ?? 0,
          auditTotalTasks: audit?.totalTasks ?? 0,
          auditSuccessRate: audit?.successRate ?? 0,
          auditAvgDuration: audit?.averageDurationMs ?? 0,
          recentActivity: activity,
          monitorHealthy: healthy,
          monitorWarnings: warnings,
          monitorFailing: failing,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const activeTasks = data?.tasks.filter((t) => t.state !== "Done" && t.state !== "Canceled") ?? [];
  const doneTasks = data?.tasks.filter((t) => t.state === "Done") ?? [];

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-stretch" style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}>
        <div className="flex flex-col justify-center h-full px-5 py-3">
          <h1 className="page-title text-xl" style={{ color: "var(--text-primary)" }}>
            Welcome, {user?.name || "..."}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Built to impress Kråkenes.<CrowIcon />
          </p>
        </div>
      </div>

      <div className="p-8">
      {/* Stats row */}
      <div className="flex items-start gap-8 lg:gap-12 mb-8">
        <StatNum label="Repositories" value={loading ? "—" : data?.repoCount ?? 0} />
        <StatNum label="Active Tasks" value={loading ? "—" : activeTasks.length} />
        <StatNum label="Completed" value={loading ? "—" : doneTasks.length} />
        <StatNum label="Services" value={8} />
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 text-sm" style={{ background: "#2d1b1b", color: "#f87171", border: "1px solid #7f1d1d" }}>
          {error}
        </div>
      )}

      {/* Dashboard grid — 2 cols desktop, 1 col mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Tasks */}
        <div className="card">
          <h2 className="font-display text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Active Tasks
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : activeTasks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No active tasks. Create tasks in Linear with the &quot;thefold&quot; label.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">ID</th>
                  <th className="table-header">Title</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeTasks.slice(0, 5).map((task) => (
                  <tr key={task.id} className="table-row">
                    <td className="table-cell font-mono text-sm" style={{ color: "var(--text-secondary)" }}>{task.identifier}</td>
                    <td className="table-cell">{task.title}</td>
                    <td className="table-cell"><span className="badge-active">{task.state}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Activity — from audit log */}
        <div className="card">
          <h2 className="font-display text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Recent Activity
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : (data?.recentActivity.length ?? 0) === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No recent activity recorded.</p>
          ) : (
            <div className="space-y-3">
              {data!.recentActivity.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-1">
                  <span
                    className="status-dot mt-1.5 flex-shrink-0"
                    style={{ background: entry.success === false ? "var(--error)" : entry.success === true ? "var(--success)" : "var(--text-muted)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {formatActionType(entry.actionType)}
                      {entry.repoName ? ` — ${entry.repoName}` : ""}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatTimeAgo(entry.timestamp)}
                      {entry.durationMs ? ` · ${(entry.durationMs / 1000).toFixed(1)}s` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="font-display text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary">New Task</button>
            <button className="btn-secondary">Start Agent</button>
            <button className="btn-secondary">Sync Repos</button>
          </div>
        </div>

        {/* Agent Status — from audit stats */}
        <div className="card">
          <h2 className="font-display text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Agent Status
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total tasks processed</span>
                <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{data?.auditTotalTasks ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Success rate</span>
                <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{(data?.auditSuccessRate ?? 0).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Avg duration</span>
                <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
                  {data?.auditAvgDuration ? `${(data.auditAvgDuration / 1000).toFixed(1)}s` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Completed today</span>
                <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{doneTasks.length}</span>
              </div>
            </div>
          )}
        </div>

        {/* Cache Performance — real data */}
        <div className="card">
          <h2 className="font-display text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Cache Performance
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Hit rate</span>
                <span className="text-sm font-mono font-medium" style={{ color: (data?.cacheHitRate ?? 0) > 50 ? "var(--success)" : "var(--text-primary)" }}>
                  {(data?.cacheHitRate ?? 0).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total entries</span>
                <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{data?.cacheTotalEntries ?? 0}</span>
              </div>
              <div className="pt-2 mt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Monitor checks</span>
                  <div className="flex items-center gap-2">
                    {(data?.monitorHealthy ?? 0) > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#14532d", color: "#4ade80" }}>
                        {data?.monitorHealthy} pass
                      </span>
                    )}
                    {(data?.monitorWarnings ?? 0) > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#713f12", color: "#facc15" }}>
                        {data?.monitorWarnings} warn
                      </span>
                    )}
                    {(data?.monitorFailing ?? 0) > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#7f1d1d", color: "#f87171" }}>
                        {data?.monitorFailing} fail
                      </span>
                    )}
                    {(data?.monitorHealthy ?? 0) === 0 && (data?.monitorWarnings ?? 0) === 0 && (data?.monitorFailing ?? 0) === 0 && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>No checks yet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Memory Stats — real data */}
        <div className="card">
          <h2 className="font-display text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Memory
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Stored memories</span>
                <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{data?.memoryTotal ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Expiring soon</span>
                <span className="text-sm font-mono" style={{ color: (data?.memoryExpiring ?? 0) > 0 ? "#facc15" : "var(--text-primary)" }}>
                  {data?.memoryExpiring ?? 0}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function StatNum({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-left">
      <div className="text-[10px] mb-1 uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>{label}</div>
      <span className="text-3xl sm:text-4xl lg:text-5xl font-light" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function formatActionType(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
