"use client";

import { useState, useEffect } from "react";
import { listTheFoldTasks, getTaskStats, syncLinearTasks, type TheFoldTask } from "@/lib/api";

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "var(--bg-tertiary)", color: "var(--text-muted)", label: "Venter" },
  in_progress: { bg: "#3b82f620", color: "#60a5fa", label: "Pågår" },
  completed: { bg: "#22c55e20", color: "#22c55e", label: "Ferdig" },
  failed: { bg: "#ef444420", color: "#ef4444", label: "Feilet" },
  cancelled: { bg: "var(--bg-tertiary)", color: "var(--text-muted)", label: "Avbrutt" },
  skipped: { bg: "var(--bg-tertiary)", color: "var(--text-muted)", label: "Hoppet over" },
};

const SOURCE_ICONS: Record<string, string> = {
  manual: "\u{1F464}",
  linear: "\u{1F504}",
  healing: "\u{1FA79}",
  chat: "\u{1F4AC}",
  orchestrator: "\u{1F3D7}\uFE0F",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TheFoldTask[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byRepo: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const [tasksRes, statsRes] = await Promise.all([
          listTheFoldTasks({ limit: 50 }),
          getTaskStats(),
        ]);
        setTasks(tasksRes.tasks);
        setStats(statsRes);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncLinearTasks();
      setSyncResult({ created: res.created, updated: res.updated });
      // Reload tasks
      const [tasksRes, statsRes] = await Promise.all([
        listTheFoldTasks({ limit: 50 }),
        getTaskStats(),
      ]);
      setTasks(tasksRes.tasks);
      setStats(statsRes);
    } catch {
      // silent
    } finally {
      setSyncing(false);
    }
  }

  const filtered = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterSource !== "all" && t.source !== filterSource) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Totalt" value={stats?.total ?? 0} />
        <StatCard label="Pågår" value={stats?.byStatus?.in_progress ?? 0} color="#60a5fa" />
        <StatCard label="Fullført" value={stats?.byStatus?.completed ?? 0} color="#22c55e" />
        <StatCard label="Feilet" value={stats?.byStatus?.failed ?? 0} color="#ef4444" />
      </div>

      {/* Linear sync */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-sans font-medium" style={{ color: "var(--text-primary)" }}>
              Linear-synkronisering
            </h3>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Synkroniser oppgaver fra Linear til TheFold
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: syncing ? "var(--bg-tertiary)" : "var(--accent)",
              color: syncing ? "var(--text-muted)" : "#fff",
            }}
          >
            {syncing ? "Synkroniserer..." : "Synkroniser nå"}
          </button>
        </div>
        {syncResult && (
          <div
            className="mt-3 text-xs px-3 py-2 rounded"
            style={{ background: "#22c55e10", color: "#22c55e", border: "1px solid #22c55e30" }}
          >
            {syncResult.created} nye, {syncResult.updated} oppdaterte
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field text-sm"
          style={{ width: "auto" }}
        >
          <option value="all">Alle statuser</option>
          <option value="pending">Venter</option>
          <option value="in_progress">Pågår</option>
          <option value="completed">Fullført</option>
          <option value="failed">Feilet</option>
          <option value="cancelled">Avbrutt</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="input-field text-sm"
          style={{ width: "auto" }}
        >
          <option value="all">Alle kilder</option>
          <option value="manual">Manuell</option>
          <option value="linear">Linear</option>
          <option value="healing">Healing</option>
          <option value="chat">Chat</option>
          <option value="orchestrator">Orchestrator</option>
        </select>
      </div>

      {/* Task table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-sans font-medium" style={{ color: "var(--text-primary)" }}>
            Oppgaver ({filtered.length})
          </h3>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Laster...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Ingen oppgaver funnet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="table-header text-left px-5 py-3">Tittel</th>
                  <th className="table-header text-left px-3 py-3">Repo</th>
                  <th className="table-header text-center px-3 py-3">Status</th>
                  <th className="table-header text-center px-3 py-3">Prioritet</th>
                  <th className="table-header text-center px-3 py-3">Kilde</th>
                  <th className="table-header text-right px-5 py-3">Dato</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => {
                  const style = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
                  return (
                    <tr key={task.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-5 py-3">
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {task.title}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                          {task.repo || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: style.bg, color: style.color }}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                          {task.priority > 0 ? `P${task.priority}` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span title={task.source}>
                          {SOURCE_ICONS[task.source] || task.source}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(task.createdAt).toLocaleDateString("nb-NO")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="text-2xl font-mono font-medium" style={{ color: color || "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
