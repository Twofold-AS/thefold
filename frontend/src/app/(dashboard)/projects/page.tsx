"use client";

import { useMemo } from "react";
import Link from "next/link";
import { T } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import Skeleton from "@/components/Skeleton";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import { listTheFoldTasks, type TheFoldTask } from "@/lib/api";
import { GitBranch, CheckSquare, Clock, AlertCircle } from "lucide-react";

function statusVariant(status: string): "success" | "accent" | "error" | "default" {
  if (status === "done" || status === "completed") return "success";
  if (status === "in_progress" || status === "in_review") return "accent";
  if (status === "blocked") return "error";
  return "default";
}

interface Project {
  repo: string;
  tasks: TheFoldTask[];
  done: number;
  active: number;
  blocked: number;
  lastActivity: string;
}

function deriveProjects(tasks: TheFoldTask[]): Project[] {
  const byRepo = new Map<string, TheFoldTask[]>();
  for (const t of tasks) {
    const repo = t.repo || "unassigned";
    if (!byRepo.has(repo)) byRepo.set(repo, []);
    byRepo.get(repo)!.push(t);
  }
  return Array.from(byRepo.entries())
    .map(([repo, ts]) => ({
      repo,
      tasks: ts,
      done: ts.filter(t => t.status === "done" || t.status === "completed").length,
      active: ts.filter(t => t.status === "in_progress" || t.status === "in_review").length,
      blocked: ts.filter(t => t.status === "blocked").length,
      lastActivity: ts.reduce((acc, t) => t.updatedAt > acc ? t.updatedAt : acc, ts[0]?.updatedAt ?? ""),
    }))
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
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

export default function ProjectsPage() {
  const { data, loading } = useApiData(() => listTheFoldTasks({ limit: 500 }), []);
  const tasks: TheFoldTask[] = data?.tasks ?? [];
  const projects = useMemo(() => deriveProjects(tasks), [tasks]);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Prosjekter</SectionLabel>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0, fontFamily: T.sans }}>
          Alle prosjekter
        </h1>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>
          Repositories med aktive oppgaver
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} style={{ height: 110, borderRadius: T.r }} />)}
        </div>
      ) : projects.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          border: `1px dashed ${T.border}`, borderRadius: T.r,
          color: T.textFaint, fontSize: 13,
        }}>
          Ingen prosjekter enda. Opprett en oppgave for å komme i gang.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {projects.map(p => {
            const progress = p.tasks.length > 0
              ? Math.round((p.done / p.tasks.length) * 100)
              : 0;
            const encodedRepo = encodeURIComponent(p.repo);

            return (
              <Link key={p.repo} href={`/projects/${encodedRepo}`} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r,
                    padding: "20px 24px",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = T.borderHover)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <GitBranch size={15} color={T.accent} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                          {p.repo}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.textMuted }}>
                          <CheckSquare size={12} />
                          {p.tasks.length} oppgaver
                        </span>
                        {p.active > 0 && (
                          <Tag variant="accent">{p.active} aktiv</Tag>
                        )}
                        {p.blocked > 0 && (
                          <Tag variant="error">
                            <AlertCircle size={10} style={{ marginRight: 3 }} />
                            {p.blocked} blokkert
                          </Tag>
                        )}
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textFaint }}>
                          <Clock size={11} />
                          {timeAgo(p.lastActivity)}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: T.mono }}>
                        {progress}%
                      </div>
                      <div style={{ fontSize: 11, color: T.textFaint }}>ferdig</div>
                      <div style={{
                        marginTop: 6, width: 80, height: 4,
                        background: T.border, borderRadius: 2, overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          background: progress === 100 ? T.success : T.accent,
                          width: `${progress}%`,
                          transition: "width 0.3s",
                        }} />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
