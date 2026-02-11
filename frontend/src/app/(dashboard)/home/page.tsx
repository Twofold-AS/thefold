"use client";

import { useEffect, useState } from "react";
import { getTasks, type LinearTask } from "@/lib/api";

function CrowIcon() {
  return (
    <svg className="inline-block w-4 h-4 ml-1.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--text-secondary)" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 18c1-2 3-3 5-3 1.5 0 2.5.5 3 1l2-4c.5-1 1.5-2 3-2.5 1-.3 2.5-.3 3.5.5l.5.5-1 1c-.5.5-1.5.8-2.5.5l-1.5 3c-.5 1-1.5 2-3 2.5L10 18M7 9c0-2 1.5-4 4-5 1-.4 2-.4 3 0l1 .5-.5 1c-.5.5-1.5.5-2 0-.8-.3-1.7-.2-2.5.3C9 6.8 8.5 7.8 8.5 9c0 .5.1 1 .3 1.5" />
    </svg>
  );
}

export default function HomePage() {
  const [tasks, setTasks] = useState<LinearTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTasks()
      .then((res) => setTasks(res.tasks))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeTasks = tasks.filter((t) => t.state !== "Done" && t.state !== "Canceled");
  const doneTasks = tasks.filter((t) => t.state === "Done");

  return (
    <div>
      {/* Header bar — full width edge-to-edge */}
      <div
        className="-mx-8 -mt-16 sm:-mt-8 mb-8 px-8 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
        style={{ background: "#171717", borderBottom: "1px solid #272727" }}
      >
        <div>
          <h1 className="font-heading text-[28px] font-normal leading-tight" style={{ color: "var(--text-primary)" }}>
            Welcome Kjartan
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Built to impress Kråkenes.<CrowIcon />
          </p>
        </div>

        <div className="flex items-start gap-8 lg:gap-12">
          <StatNum label="Repositories" value={1} change="+1" />
          <StatNum label="Active Tasks" value={activeTasks.length} change="+2" />
          <StatNum label="Completed" value={doneTasks.length} change="+3" />
          <StatNum label="Services" value={8} change="+1" />
        </div>
      </div>

      {/* Dashboard grid — 2 cols desktop, 1 col mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Tasks */}
        <div className="card">
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
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

        {/* Recent Activity */}
        <div className="card">
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Recent Activity
          </h2>
          <div className="space-y-3">
            {[
              { time: "2 min ago", text: "Agent completed task TF-42", type: "success" },
              { time: "15 min ago", text: "PR #17 merged to main", type: "info" },
              { time: "1h ago", text: "Memory stored: auth flow decisions", type: "neutral" },
              { time: "2h ago", text: "Sandbox validation passed (3/3)", type: "success" },
              { time: "3h ago", text: "Linear sync: 4 tasks updated", type: "neutral" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 py-1">
                <span
                  className="status-dot mt-1.5 flex-shrink-0"
                  style={{ background: item.type === "success" ? "var(--success)" : item.type === "info" ? "var(--info)" : "var(--text-muted)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{item.text}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary">New Task</button>
            <button className="btn-secondary">Start Agent</button>
            <button className="btn-secondary">Sync Repos</button>
          </div>
        </div>

        {/* Agent Status */}
        <div className="card">
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Agent Status
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Status</span>
              <div className="flex items-center gap-2">
                <span className="status-dot" style={{ background: "var(--success)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Idle</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Last run</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>2 min ago</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Next scheduled</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>in 13 min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Tasks today</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{doneTasks.length} completed</span>
            </div>
          </div>
        </div>

        {/* Recent Pull Requests */}
        <div className="card">
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Recent Pull Requests
          </h2>
          <div className="space-y-3">
            {[
              { id: "#17", title: "Add auth middleware to gateway", status: "merged" },
              { id: "#16", title: "Implement memory search with pgvector", status: "merged" },
              { id: "#15", title: "Fix sandbox timeout handling", status: "open" },
              { id: "#14", title: "Add Linear webhook integration", status: "merged" },
            ].map((pr) => (
              <div key={pr.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>{pr.id}</span>
                  <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{pr.title}</span>
                </div>
                <span className={pr.status === "merged" ? "badge-active" : "badge-inactive"} style={{ flexShrink: 0 }}>
                  {pr.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Token Usage Today */}
        <div className="card">
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Token Usage Today
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Input tokens</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>124,350</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Output tokens</span>
              <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>48,920</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total tokens</span>
              <span className="text-sm font-mono font-medium" style={{ color: "var(--text-primary)" }}>173,270</span>
            </div>
            <div className="pt-2 mt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Estimated cost</span>
                <span className="text-sm font-mono font-medium" style={{ color: "var(--text-primary)" }}>$1.24</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatNum({ label, value, change }: { label: string; value: number; change?: string }) {
  return (
    <div className="text-left">
      <div className="text-[10px] mb-1 uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-3xl sm:text-4xl lg:text-5xl font-light" style={{ color: "var(--text-primary)" }}>{value}</span>
        {change && (
          <span className="text-xs bg-green-900 text-green-400 rounded-md px-1.5 py-0.5">{change}</span>
        )}
      </div>
    </div>
  );
}
