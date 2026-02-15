"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import {
  listAuditLog,
  listTheFoldTasks,
  listBuilderJobs,
  type AuditLogEntry,
  type TheFoldTask,
  type BuilderJobSummary,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

/* ── Event types ── */

interface TimelineEvent {
  id: string;
  time: Date;
  icon: string;
  category: string;
  title: string;
  detail?: string;
  color: string;
}

const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  builder: { icon: "\uD83D\uDD27", color: "#3b82f6" },
  review_approved: { icon: "\u2705", color: "#22c55e" },
  review_rejected: { icon: "\u274C", color: "#ef4444" },
  healing: { icon: "\uD83D\uDD04", color: "#a855f7" },
  task: { icon: "\uD83D\uDCCB", color: "#eab308" },
  sync: { icon: "\uD83D\uDD0D", color: "#06b6d4" },
  chat: { icon: "\uD83D\uDCAC", color: "#8b5cf6" },
  cost: { icon: "\uD83D\uDCB0", color: "#f97316" },
  agent: { icon: "\uD83E\uDD16", color: "#3b82f6" },
};

/* ── Helpers ── */

function auditToEvent(entry: AuditLogEntry): TimelineEvent {
  const actionType = entry.actionType.toLowerCase();
  let cat = "agent";
  if (actionType.includes("build") || actionType.includes("sandbox") || actionType.includes("file")) cat = "builder";
  else if (actionType.includes("review") && actionType.includes("approv")) cat = "review_approved";
  else if (actionType.includes("review") && actionType.includes("reject")) cat = "review_rejected";
  else if (actionType.includes("heal") || actionType.includes("fix")) cat = "healing";
  else if (actionType.includes("task")) cat = "task";
  else if (actionType.includes("sync") || actionType.includes("linear")) cat = "sync";
  else if (actionType.includes("chat") || actionType.includes("context")) cat = "chat";
  else if (actionType.includes("cost") || actionType.includes("token")) cat = "cost";

  const style = CATEGORY_STYLE[cat] || CATEGORY_STYLE.agent;
  return {
    id: `audit-${entry.id}`,
    time: new Date(entry.timestamp),
    icon: style.icon,
    category: cat,
    title: entry.actionType.replace(/_/g, " "),
    detail: entry.errorMessage || (entry.details ? JSON.stringify(entry.details).substring(0, 120) : undefined),
    color: style.color,
  };
}

function taskToEvent(task: TheFoldTask): TimelineEvent {
  const style = CATEGORY_STYLE.task;
  return {
    id: `task-${task.id}`,
    time: new Date(task.updatedAt || task.createdAt),
    icon: style.icon,
    category: "task",
    title: `Oppgave: ${task.title}`,
    detail: `Status: ${task.status}`,
    color: style.color,
  };
}

function builderToEvent(job: BuilderJobSummary): TimelineEvent {
  const style = CATEGORY_STYLE.builder;
  return {
    id: `builder-${job.id}`,
    time: new Date(job.completedAt || job.startedAt || job.createdAt),
    icon: style.icon,
    category: "builder",
    title: `Builder: ${job.buildStrategy} (${job.status})`,
    detail: `${job.totalSteps} steg, $${job.totalCostUsd.toFixed(3)}`,
    color: style.color,
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
}

function groupByDate(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const key = e.time.toLocaleDateString("nb-NO");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

/* ── Main Page ── */

export default function RepoActivityPage() {
  const params = useParams<{ name: string }>();
  const pathname = usePathname();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [auditRes, tasksRes, builderRes] = await Promise.all([
          listAuditLog({ repoName: params.name, limit: 50 }).catch(() => ({ entries: [], total: 0 })),
          listTheFoldTasks({ repo: params.name, limit: 30 }).catch(() => ({ tasks: [], total: 0 })),
          listBuilderJobs({ repo: params.name, limit: 20 }).catch(() => ({ jobs: [], total: 0 })),
        ]);

        const allEvents: TimelineEvent[] = [
          ...auditRes.entries.map(auditToEvent),
          ...tasksRes.tasks.map(taskToEvent),
          ...builderRes.jobs.map(builderToEvent),
        ];

        // Sort by time, newest first
        allEvents.sort((a, b) => b.time.getTime() - a.time.getTime());
        setEvents(allEvents);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.name]);

  const grouped = groupByDate(events);

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
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--text-secondary)" }}
          />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
          <p className="text-sm">Ingen aktivitet funnet</p>
          <p className="text-xs mt-1">Aktivitet vises n&aring;r agenten jobber med dette repoet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {Array.from(grouped.entries()).map(([dateStr, dayEvents]) => (
            <div key={dateStr}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatDate(dayEvents[0].time)}
                </span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {dayEvents.length} hendelser
                </span>
              </div>

              {/* Events */}
              <div className="space-y-1 pl-2">
                {dayEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start gap-3 py-2 px-3 rounded-md transition-colors"
                    style={{ background: "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span className="text-sm flex-shrink-0 mt-0.5">{evt.icon}</span>
                    <span
                      className="text-[11px] font-mono flex-shrink-0 mt-0.5"
                      style={{ color: "var(--text-muted)", minWidth: "40px" }}
                    >
                      {formatTime(evt.time)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {evt.title}
                      </p>
                      {evt.detail && (
                        <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                          {evt.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
