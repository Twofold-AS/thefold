"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  listAuditLog,
  listTheFoldTasks,
  listBuilderJobs,
  getRepoActivity,
  type AuditLogEntry,
  type TheFoldTask,
  type BuilderJobSummary,
  type RepoActivityEvent,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";
import { ActivityIcon } from "@/components/ActivityIcon";
import { useUser } from "@/contexts/UserPreferencesContext";
import { Bot } from "lucide-react";

/* ── Event types ── */

interface TimelineEvent {
  id: string;
  time: Date;
  category: string;
  title: string;
  detail?: string;
  color: string;
}

const CATEGORY_STYLE: Record<string, { color: string }> = {
  builder: { color: "#fff" },
  review_approved: { color: "#fff" },
  review_rejected: { color: "#fff" },
  healing: { color: "#fff" },
  task: { color: "#fff" },
  sync: { color: "#fff" },
  chat: { color: "#fff" },
  cost: { color: "#fff" },
  agent: { color: "#fff" },
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
    category: "builder",
    title: `Builder: ${job.buildStrategy} (${job.status})`,
    detail: `${job.totalSteps} steg, $${job.totalCostUsd.toFixed(3)}`,
    color: style.color,
  };
}

function repoActivityToEvent(a: RepoActivityEvent): TimelineEvent {
  const typeMap: Record<string, string> = {
    chat: "chat",
    ai_response: "agent",
    tool_use: "builder",
    task_created: "task",
    file_uploaded: "builder",
  };
  const cat = typeMap[a.eventType] || "agent";
  const style = CATEGORY_STYLE[cat] || CATEGORY_STYLE.agent;
  let detail = a.description || undefined;
  if (a.metadata) {
    try {
      const meta = typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata;
      if (meta.model) detail = `${meta.model}`;
      if (meta.tokens) detail = (detail ? detail + " " : "") + `${meta.tokens} tokens`;
      if (meta.cost) detail = (detail ? detail + " " : "") + `$${Number(meta.cost).toFixed(4)}`;
    } catch { /* ignore */ }
  }
  return {
    id: `activity-${a.id}`,
    time: new Date(a.createdAt),
    category: cat,
    title: a.title,
    detail,
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
  const { aiName } = useUser();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [auditRes, tasksRes, builderRes, activityRes] = await Promise.all([
          listAuditLog({ repoName: params.name, limit: 50 }).catch(() => ({ entries: [], total: 0 })),
          listTheFoldTasks({ repo: params.name, limit: 30 }).catch(() => ({ tasks: [], total: 0 })),
          listBuilderJobs({ repo: params.name, limit: 20 }).catch(() => ({ jobs: [], total: 0 })),
          getRepoActivity(params.name).catch(() => ({ activities: [] })),
        ]);

        const allEvents: TimelineEvent[] = [
          ...auditRes.entries.map(auditToEvent),
          ...tasksRes.tasks.map(taskToEvent),
          ...builderRes.jobs.map(builderToEvent),
          ...activityRes.activities.map(repoActivityToEvent),
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
        title="Aktivitet"
        subtitle={params.name}
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
                    <span className="flex-shrink-0 mt-0.5" style={{ color: "#fff" }}>
                      {evt.category === "agent" || evt.category === "chat" ? (
                        <Bot size={14} />
                      ) : (
                        <ActivityIcon type={evt.category} />
                      )}
                    </span>
                    <span
                      className="text-[11px] font-mono flex-shrink-0 mt-0.5"
                      style={{ color: "var(--text-muted)", minWidth: "40px" }}
                    >
                      {formatTime(evt.time)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {(evt.category === "agent" || evt.category === "chat") && (
                          <span className="font-medium mr-1" style={{ color: "var(--text-secondary)" }}>{aiName}</span>
                        )}
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
