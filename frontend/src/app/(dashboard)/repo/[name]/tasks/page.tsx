"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getTasksByLabel, checkPendingTasks, type LinearTask } from "@/lib/api";

type StatusFilter = "all" | "active" | "done";

export default function RepoTasksPage() {
  const params = useParams<{ name: string }>();
  const [tasks, setTasks] = useState<LinearTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.name]);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await getTasksByLabel(params.name);
      setTasks(res.tasks);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await checkPendingTasks();
      await loadTasks();
    } catch {
      // Silent
    } finally {
      setSyncing(false);
    }
  }

  const filtered = tasks.filter((t) => {
    if (filter === "active") return t.state !== "Done" && t.state !== "Canceled";
    if (filter === "done") return t.state === "Done";
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[32px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
            Tasks
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Linear tasks labeled &quot;{params.name}&quot;
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
          {syncing ? (
            <>
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.2)", borderTopColor: "#000" }} />
              Syncing...
            </>
          ) : "Sync from Linear"}
        </button>
      </div>

      <div className="flex gap-1 mt-6 mb-4">
        {(["all", "active", "done"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 text-sm transition-colors duration-100"
            style={{
              borderRadius: "2px",
              background: filter === f ? "var(--bg-hover)" : "transparent",
              color: filter === f ? "var(--text-primary)" : "var(--text-secondary)",
              border: filter === f ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {f === "all" ? "All" : f === "active" ? "Active" : "Done"}
          </button>
        ))}
        <span className="text-sm ml-auto self-center" style={{ color: "var(--text-muted)" }}>
          {filtered.length} tasks
        </span>
      </div>

      {loading ? (
        <p className="text-sm py-8" style={{ color: "var(--text-muted)" }}>Loading tasks...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No tasks found. Create tasks in Linear with label &quot;{params.name}&quot;.
          </p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">ID</th>
              <th className="table-header">Title</th>
              <th className="table-header">Status</th>
              <th className="table-header">Priority</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((task) => (
              <tr key={task.id} className="table-row cursor-pointer" onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}>
                <td className="table-cell font-mono text-sm" style={{ color: "var(--text-secondary)" }}>{task.identifier}</td>
                <td className="table-cell">{task.title}</td>
                <td className="table-cell"><span className="badge-active">{task.state}</span></td>
                <td className="table-cell text-sm" style={{ color: "var(--text-muted)" }}>
                  {["None", "Urgent", "High", "Medium", "Low"][task.priority] || "None"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
