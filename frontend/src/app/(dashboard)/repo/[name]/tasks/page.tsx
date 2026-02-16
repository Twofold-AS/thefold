"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  listTheFoldTasks,
  listDeletedTasks,
  createTask,
  syncLinearTasks,
  softDeleteTask,
  restoreTask,
  permanentDeleteTask,
  cancelTask,
  type TheFoldTask,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

/* ── Status columns ── */

const COLUMNS = [
  { key: "backlog", label: "Backlog", color: "var(--text-muted)" },
  { key: "planned", label: "Planlagt", color: "#a855f7" },
  { key: "in_progress", label: "P\u00e5g\u00e5r", color: "#3b82f6" },
  { key: "in_review", label: "Review", color: "#f97316" },
  { key: "done", label: "Ferdig", color: "#22c55e" },
  { key: "blocked", label: "Blokkert", color: "#ef4444" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const PRIORITY_LABELS: Record<number, string> = { 1: "Haster", 2: "H\u00f8y", 3: "Normal", 4: "Lav" };
const PRIORITY_COLORS: Record<number, string> = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "var(--text-muted)" };
const SOURCE_ICONS: Record<string, string> = { manual: "\uD83D\uDC64", linear: "\uD83D\uDD04", agent: "\uD83E\uDE79" };

/* ── Helpers ── */

function classifyStatus(status: string): ColumnKey {
  const s = status.toLowerCase();
  if (s === "in_progress" || s.includes("progress") || s.includes("started")) return "in_progress";
  if (s === "in_review" || s === "pending_review") return "in_review";
  if (s === "done" || s.includes("complete")) return "done";
  if (s === "blocked") return "blocked";
  if (s === "planned" || s === "todo") return "planned";
  return "backlog";
}

/* ── Main Page ── */

export default function RepoTasksPage() {
  const params = useParams<{ name: string }>();
  const [tasks, setTasks] = useState<TheFoldTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletedTasks, setDeletedTasks] = useState<TheFoldTask[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [res, deletedRes] = await Promise.all([
        listTheFoldTasks({
          repo: params.name,
          status: filterStatus || undefined,
          limit: 200,
        }),
        listDeletedTasks(params.name),
      ]);
      setTasks(res.tasks);
      setDeletedTasks(deletedRes.tasks);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [params.name, filterStatus]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncLinearTasks();
      setSyncResult(`${res.created} nye, ${res.updated} oppdatert`);
      await loadTasks();
    } catch {
      setSyncResult("Synkronisering feilet");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSoftDelete(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // 1. Fjern fra hovedlisten
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    // 2. Legg til i deleted-listen UMIDDELBART
    setDeletedTasks((prev) => [...prev, { ...task, status: "deleted" as const }]);

    // 3. Kall API (fire and forget for UI-speed)
    softDeleteTask(taskId).catch(() => {
      // Rollback ved feil
      setTasks((prev) => [...prev, task]);
      setDeletedTasks((prev) => prev.filter((t) => t.id !== taskId));
    });

    // 4. IKKE kall loadTasks() her — optimistisk oppdatering er nok
  }

  async function handleCancel(taskId: string) {
    // Optimistic: move from in_progress to backlog
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "backlog" } : t));
    try {
      await cancelTask(taskId);
    } catch {
      // Rollback
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_progress" } : t));
    }
  }

  // Auto-permanent-delete after 5 minutes
  useEffect(() => {
    if (deletedTasks.length === 0) return;
    const timer = setTimeout(async () => {
      for (const task of deletedTasks) {
        await permanentDeleteTask(task.id);
      }
      setDeletedTasks([]);
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [deletedTasks]);

  // Group tasks by column
  const grouped = new Map<ColumnKey, TheFoldTask[]>();
  for (const col of COLUMNS) grouped.set(col.key, []);
  for (const t of tasks) {
    const col = classifyStatus(t.status);
    grouped.get(col)!.push(t);
  }

  // Apply priority filter client-side
  const filteredGrouped = new Map<ColumnKey, TheFoldTask[]>();
  for (const [key, items] of grouped) {
    filteredGrouped.set(
      key,
      filterPriority ? items.filter((t) => String(t.priority) === filterPriority) : items,
    );
  }

  return (
    <div>
      <PageHeaderBar
        title="Oppgaver"
        subtitle={params.name}
        cells={syncResult ? [
          {
            content: (
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {syncResult}
              </span>
            ),
          },
        ] : undefined}
        rightCells={[
          {
            content: (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-sm flex items-center gap-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                {syncing ? (
                  <>
                    <span className="w-3 h-3 border-2 rounded-full animate-spin inline-block" style={{ borderColor: "rgba(255,255,255,0.2)", borderTopColor: "var(--text-primary)" }} />
                    Synkroniserer...
                  </>
                ) : (
                  "Synk fra Linear"
                )}
              </button>
            ),
          },
          {
            content: <span className="text-sm" style={{ color: "var(--text-primary)" }}>+ Ny oppgave</span>,
            onClick: () => setShowCreate(true),
          },
        ]}
      />

      <div className="p-6">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {tasks.length} oppgaver
        </p>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field text-xs py-1.5 px-2"
            style={{ minWidth: 100 }}
          >
            <option value="">Alle statuser</option>
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="input-field text-xs py-1.5 px-2"
            style={{ minWidth: 100 }}
          >
            <option value="">Alle prioriteter</option>
            <option value="1">Haster</option>
            <option value="2">H&oslash;y</option>
            <option value="3">Normal</option>
            <option value="4">Lav</option>
          </select>
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--text-secondary)" }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {COLUMNS.map((col) => {
            const items = filteredGrouped.get(col.key)!;
            return (
              <div
                key={col.key}
                className="p-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-xs font-medium" style={{ color: col.color }}>
                    {col.label}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 ml-auto"
                    style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-[11px] text-center py-4" style={{ color: "var(--text-muted)" }}>
                      Ingen oppgaver
                    </p>
                  ) : (
                    items.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        expanded={expanded === task.id}
                        onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                        onDelete={() => handleSoftDelete(task.id)}
                        onCancel={() => handleCancel(task.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deleted tasks */}
      {deletedTasks.length > 0 && (
        <div className="mt-6" style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Slettet ({deletedTasks.length}) — fjernes permanent om 5 minutter
            </span>
          </div>
          {deletedTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: 0.5 }}
            >
              <span className="text-sm line-through" style={{ color: "var(--text-muted)" }}>
                {task.title}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    setDeletedTasks((prev) => prev.filter((t) => t.id !== task.id));
                    setTasks((prev) => [...prev, { ...task, status: "backlog" }]);
                    await restoreTask(task.id);
                  }}
                  className="text-xs px-2 py-1 hover:bg-white/5"
                  style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                >
                  Gjenopprett
                </button>
                <button
                  onClick={async () => {
                    setDeletedTasks((prev) => prev.filter((t) => t.id !== task.id));
                    await permanentDeleteTask(task.id);
                  }}
                  className="text-xs px-2 py-1 hover:bg-white/5"
                  style={{ border: "1px solid var(--border)", color: "#ef4444" }}
                >
                  Slett permanent
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateTaskModal
          repo={params.name}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadTasks();
          }}
        />
      )}
      </div>
    </div>
  );
}

/* ── Task Card ── */

function TaskCard({
  task,
  expanded,
  onToggle,
  onDelete,
  onCancel,
}: {
  task: TheFoldTask;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="p-2.5 cursor-pointer transition-colors"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
          style={{ background: PRIORITY_COLORS[task.priority] || "var(--text-muted)" }}
          title={PRIORITY_LABELS[task.priority] || "Normal"}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {SOURCE_ICONS[task.source] || "\uD83D\uDC64"} {task.source}
            </span>
            {task.labels.length > 0 && (
              <div className="flex gap-1">
                {task.labels.slice(0, 2).map((l) => (
                  <span
                    key={l}
                    className="text-[9px] px-1 py-0.5 rounded"
                    style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}
                  >
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {classifyStatus(task.status) === "in_progress" && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-xs px-2 py-1 hover:bg-white/5"
              style={{ border: "1px solid var(--border)", color: "#ef4444" }}
            >
              Stopp
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-6 h-6 flex items-center justify-center hover:bg-white/10 transition-colors"
            title="Slett oppgave"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-2 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          {task.description && (
            <p className="text-[11px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Prioritet: {PRIORITY_LABELS[task.priority] || "Normal"}</span>
            <span>Status: {task.status}</span>
            <span>Opprettet: {new Date(task.createdAt).toLocaleDateString("nb-NO")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Create Task Modal ── */

function CreateTaskModal({
  repo,
  onClose,
  onCreated,
}: {
  repo: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(3);
  const [labels, setLabels] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim(),
        repo,
        priority,
        labels: labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke opprette oppgave");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-lg p-6 z-10"
        style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-lg font-medium mb-4" style={{ color: "var(--text-primary)" }}>
          Ny oppgave
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="section-label block mb-1.5">Tittel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field w-full"
              placeholder="Oppgavetittel..."
              autoFocus
            />
          </div>

          <div>
            <label className="section-label block mb-1.5">Beskrivelse</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field w-full"
              rows={4}
              placeholder="Beskriv oppgaven..."
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="section-label block mb-1.5">Prioritet</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="input-field w-full"
              >
                <option value={1}>Haster</option>
                <option value={2}>H&oslash;y</option>
                <option value={3}>Normal</option>
                <option value={4}>Lav</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="section-label block mb-1.5">Labels (kommaseparert)</label>
              <input
                type="text"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                className="input-field w-full"
                placeholder="f.eks. auth, frontend"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Avbryt
            </button>
            <button type="submit" disabled={saving || !title.trim()} className="btn-primary text-sm">
              {saving ? "Oppretter..." : "Opprett"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
