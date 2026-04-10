"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { T } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import Skeleton from "@/components/Skeleton";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import { listTheFoldTasks, type TheFoldTask } from "@/lib/api";
import ActivityTimeline from "@/components/shared/ActivityTimeline";
import { ChevronLeft, GitBranch, CheckSquare, Clock, AlertCircle, ExternalLink } from "lucide-react";

function statusVariant(status: string): "success" | "accent" | "error" | "default" {
  if (status === "done" || status === "completed") return "success";
  if (status === "in_progress" || status === "in_review") return "accent";
  if (status === "blocked") return "error";
  return "default";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    done: "Ferdig",
    completed: "Ferdig",
    in_progress: "Aktiv",
    in_review: "Review",
    planned: "Planlagt",
    backlog: "Backlog",
    blocked: "Blokkert",
  };
  return map[status] ?? status;
}

function priorityLabel(p: number): string {
  if (p <= 1) return "Urgent";
  if (p === 2) return "Høy";
  if (p === 3) return "Medium";
  return "Lav";
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const repo = decodeURIComponent(id);

  const { data, loading } = useApiData(
    () => listTheFoldTasks({ repo, limit: 200 }),
    [repo],
  );
  const tasks: TheFoldTask[] = data?.tasks ?? [];

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter(t => t.status === "done" || t.status === "completed").length,
    active: tasks.filter(t => t.status === "in_progress" || t.status === "in_review").length,
    blocked: tasks.filter(t => t.status === "blocked").length,
    planned: tasks.filter(t => t.status === "planned" || t.status === "backlog").length,
  }), [tasks]);

  const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const timelineItems = useMemo(() =>
    tasks
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20)
      .map(t => ({
        id: t.id,
        title: t.title,
        description: statusLabel(t.status),
        timestamp: t.updatedAt,
        type: (t.status === "done" || t.status === "completed") ? "success" as const
          : t.status === "blocked" ? "error" as const
          : t.status === "in_progress" ? "active" as const
          : "default" as const,
      })),
    [tasks],
  );

  if (loading) {
    return (
      <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
        <Skeleton style={{ height: 200, borderRadius: T.r, marginBottom: 24 }} />
        <Skeleton style={{ height: 400, borderRadius: T.r }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
      {/* Breadcrumb */}
      <Link href="/projects" style={{ textDecoration: "none" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, color: T.textMuted, marginBottom: 20, cursor: "pointer",
        }}>
          <ChevronLeft size={14} />
          Alle prosjekter
        </div>
      </Link>

      {/* Header */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: T.r, padding: "24px 28px", marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <GitBranch size={18} color={T.accent} />
              <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: 0, fontFamily: T.mono }}>
                {repo}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <StatChip label="Totalt" value={stats.total} />
              <StatChip label="Ferdig" value={stats.done} color={T.success} />
              <StatChip label="Aktiv" value={stats.active} color={T.accent} />
              {stats.blocked > 0 && <StatChip label="Blokkert" value={stats.blocked} color={T.error} />}
              <StatChip label="Planlagt" value={stats.planned} />
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: T.text, fontFamily: T.mono, lineHeight: 1 }}>
              {progress}%
            </div>
            <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 8 }}>ferdig</div>
            <div style={{ width: 120, height: 6, background: T.border, borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3,
                background: progress === 100 ? T.success : T.accent,
                width: `${progress}%`,
              }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Task list */}
        <div>
          <SectionLabel>Oppgaver</SectionLabel>
          {tasks.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 20px",
              border: `1px dashed ${T.border}`, borderRadius: T.r,
              color: T.textFaint, fontSize: 13,
            }}>
              Ingen oppgaver i dette prosjektet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tasks
                .slice()
                .sort((a, b) => {
                  const statusOrder: Record<string, number> = {
                    blocked: 0, in_progress: 1, in_review: 2,
                    planned: 3, backlog: 4, done: 5, completed: 5,
                  };
                  return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
                })
                .map(task => (
                  <TaskRow key={task.id} task={task} />
                ))
              }
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div>
          <SectionLabel>Aktivitet</SectionLabel>
          <ActivityTimeline items={timelineItems} />
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: color ?? T.textSec, fontFamily: T.mono, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>{label}</span>
    </div>
  );
}

function TaskRow({ task }: { task: TheFoldTask }) {
  const variant = statusVariant(task.status);
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
      padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 4, lineHeight: 1.4 }}>
          {task.title}
        </div>
        {task.description && (
          <div style={{
            fontSize: 11, color: T.textFaint, lineHeight: 1.4,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {task.description}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {task.labels?.map(l => (
            <Tag key={l} variant="default">{l}</Tag>
          ))}
          <span style={{ fontSize: 10, color: T.textFaint, display: "flex", alignItems: "center", gap: 3 }}>
            <Clock size={10} />
            {timeAgo(task.updatedAt)}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        <Tag variant={variant}>{statusLabel(task.status)}</Tag>
        {task.prUrl && (
          <a href={task.prUrl} target="_blank" rel="noreferrer" style={{ color: T.accent, display: "flex", alignItems: "center", gap: 3, fontSize: 11 }}>
            PR <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
