"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  listTheFoldTasks,
  cancelTask,
  type TheFoldTask,
} from "@/lib/api";
import { GridSection } from "@/components/ui/corner-ornament";
import { Search, X, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUSES = ["all", "in_progress", "planned", "in_review", "backlog", "done", "blocked"] as const;

function statusDot(status: string) {
  const color =
    status === "in_progress" ? "var(--tf-heat)"
    : status === "done" ? "var(--tf-success)"
    : status === "blocked" ? "var(--tf-error)"
    : status === "in_review" ? "var(--tf-warning)"
    : "var(--tf-text-faint)";

  const pulse = status === "in_progress";

  return (
    <span className="relative flex items-center justify-center w-2 h-2">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping"
          style={{ background: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full w-1.5 h-1.5"
        style={{ background: color }}
      />
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TheFoldTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [repoFilter, setRepoFilter] = useState<string>("all");

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      const result = await listTheFoldTasks({ limit: 200 });
      setTasks(result.tasks);
      setTotal(result.total);
    } catch {
      // silently handle — empty list shown
    } finally {
      setLoading(false);
    }
  }

  const repos = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => { if (t.repo) set.add(t.repo); });
    return Array.from(set).sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (repoFilter !== "all" && t.repo !== repoFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, repoFilter, search]);

  function handleClick(task: TheFoldTask) {
    // Navigate to chat — if task has a known conversation, use it
    const repoPrefix = task.repo ? `repo-${task.repo.split("/").pop()}-` : "main-";
    router.push(`/chat?repo=${encodeURIComponent(task.repo || "")}`);
  }

  async function handleCancel(e: React.MouseEvent, taskId: string) {
    e.stopPropagation();
    try {
      await cancelTask(taskId);
      loadTasks();
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-full page-enter" style={{ background: "var(--tf-bg-base)" }}>
      {/* Header */}
      <GridSection showTop={false} className="px-6 pt-8 pb-6">
        <div className="max-w-4xl">
          <h1 className="text-display-lg mb-1" style={{ color: "var(--tf-text-primary)" }}>
            Tasks
          </h1>
          <p className="text-sm mb-5" style={{ color: "var(--tf-text-muted)" }}>
            {total} total — {tasks.filter((t) => t.status === "in_progress").length} active
          </p>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: "var(--tf-text-faint)" }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full rounded-lg py-2 pl-9 pr-8 text-sm outline-none transition-colors"
                style={{
                  background: "var(--tf-surface)",
                  border: "1px solid var(--tf-border-faint)",
                  color: "var(--tf-text-primary)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tf-border-faint)"; }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--tf-text-faint)" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="control-chip">
                  <span className="text-xs">
                    {statusFilter === "all" ? "All statuses" : statusFilter.replace(/_/g, " ")}
                  </span>
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {STATUSES.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)}>
                    {s === "all" ? "All statuses" : s.replace(/_/g, " ")}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Repo filter */}
            {repos.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="control-chip">
                    <span className="text-xs">
                      {repoFilter === "all" ? "All repos" : repoFilter.split("/").pop()}
                    </span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => setRepoFilter("all")}>
                    All repos
                  </DropdownMenuItem>
                  {repos.map((r) => (
                    <DropdownMenuItem key={r} onClick={() => setRepoFilter(r)}>
                      {r}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </GridSection>

      {/* Task list */}
      <GridSection className="px-6 py-2">
        {loading ? (
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg animate-pulse"
                style={{ background: "var(--tf-surface-raised)" }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
              {tasks.length === 0 ? "No tasks yet" : "No tasks match your filters"}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--tf-border-faint)" }}>
            {/* Table header */}
            <div
              className="grid grid-cols-[1fr_120px_120px_100px] gap-4 px-3 py-2 text-[11px] font-medium tracking-wider uppercase"
              style={{ color: "var(--tf-text-faint)" }}
            >
              <span>Task</span>
              <span>Status</span>
              <span>Repo</span>
              <span className="text-right">Updated</span>
            </div>

            {/* Rows */}
            {filtered.map((task) => (
              <button
                key={task.id}
                onClick={() => handleClick(task)}
                className="w-full grid grid-cols-[1fr_120px_120px_100px] gap-4 px-3 py-3 text-left transition-colors rounded-lg group"
                style={{ color: "var(--tf-text-primary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--tf-surface-raised)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Title + source badge */}
                <div className="min-w-0 flex items-center gap-2">
                  {statusDot(task.status)}
                  <span
                    className="truncate text-sm"
                    style={{
                      fontWeight: task.status === "in_progress" ? 500 : 400,
                      opacity: task.status === "done" ? 0.6 : 1,
                    }}
                  >
                    {task.title}
                  </span>
                  {task.source !== "manual" && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                      style={{
                        color: "var(--tf-text-faint)",
                        background: "var(--tf-surface-raised)",
                      }}
                    >
                      {task.source}
                    </span>
                  )}
                </div>

                {/* Status text */}
                <span
                  className="text-xs capitalize self-center"
                  style={{
                    color:
                      task.status === "in_progress" ? "var(--tf-heat)"
                      : task.status === "done" ? "var(--tf-success)"
                      : task.status === "blocked" ? "var(--tf-error)"
                      : "var(--tf-text-muted)",
                  }}
                >
                  {task.status.replace(/_/g, " ")}
                  {task.status === "in_progress" && (
                    <button
                      onClick={(e) => handleCancel(e, task.id)}
                      className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] underline"
                      style={{ color: "var(--tf-text-faint)" }}
                    >
                      cancel
                    </button>
                  )}
                </span>

                {/* Repo */}
                <span
                  className="text-xs truncate self-center font-mono"
                  style={{ color: "var(--tf-text-faint)" }}
                >
                  {task.repo ? task.repo.split("/").pop() : "—"}
                </span>

                {/* Updated */}
                <span
                  className="text-xs text-right self-center tabular-nums"
                  style={{ color: "var(--tf-text-faint)" }}
                >
                  {formatDate(task.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </GridSection>
    </div>
  );
}
