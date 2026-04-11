"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { T } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import {
  getTaskStats, getCostSummary, listTheFoldTasks, getAuditStats,
  listSkills, listProviders, getSuggestions, type Suggestion,
} from "@/lib/api";
import { getMemoryStats, searchMemories } from "@/lib/api/memory";
import { getWatchFindings, getMonitorHealth } from "@/lib/api/projects";
import ChatComposer from "@/components/ChatComposer";
import { useRepoContext } from "@/lib/repo-context";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Toggle from "@/components/Toggle";
import Skeleton from "@/components/Skeleton";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function rel(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  return `${Math.floor(h / 24)}d`;
}

function statusColor(s: string): string {
  if (s === "done" || s === "completed") return T.success;
  if (s === "in_progress" || s === "active") return T.accent;
  if (s === "failed" || s === "blocked") return T.error;
  if (s === "in_review") return "#A78BFA";
  return T.textMuted;
}

function priorityColor(p: Suggestion["priority"]): string {
  if (p === "critical") return T.error;
  if (p === "high") return T.warning;
  if (p === "medium") return T.accent;
  return T.textMuted;
}

function typeIcon(t: Suggestion["type"]): string {
  if (t === "cve") return "🔒";
  if (t === "outdated_dep") return "📦";
  if (t === "test_coverage") return "🧪";
  if (t === "error_pattern") return "⚡";
  if (t === "similar_failure") return "🔁";
  return "💡";
}

function severityColor(s: string): string {
  if (s === "critical") return T.error;
  if (s === "warning") return T.warning;
  return T.textMuted;
}

const MEM_TYPE_COLORS: Record<string, string> = {
  decision: "#A78BFA",
  error_pattern: T.error,
  strategy: T.accent,
  session: T.textMuted,
  skill: T.success,
  task: "#60A5FA",
  general: T.textFaint,
  code_pattern: "#F59E0B",
};

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, loading }: {
  label: string; value: string; color?: string; loading?: boolean;
}) {
  return (
    <div style={{ padding: "18px 24px" }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      {loading ? (
        <div style={{ height: 32, width: 60, background: T.subtle, borderRadius: 4 }} />
      ) : (
        <div style={{ fontSize: 28, fontWeight: 600, color: color || T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value}
        </div>
      )}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${T.border}`,
      background: T.surface,
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}

function PanelHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderBottom: `1px solid ${T.border}`, background: T.subtle,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.textSec, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </span>
        {count !== undefined && (
          <span style={{ fontSize: 10, color: T.textFaint, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 999, padding: "1px 7px", fontFamily: T.mono }}>
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: "14px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>{text}</div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const router = useRouter();
  const { selectedRepo } = useRepoContext();

  const repoName = selectedRepo?.name;

  const { data: taskStats, loading: taskLoading } = useApiData(() => getTaskStats(), []);
  const { data: costData, loading: costLoading } = useApiData(() => getCostSummary(), []);
  const { data: recentTasksData, loading: tasksLoading } = useApiData(() => listTheFoldTasks({ limit: 5 }), []);
  const { data: auditStats, loading: auditLoading } = useApiData(() => getAuditStats(), []);
  const { data: skillsData, loading: skillsLoading } = useApiData(() => listSkills(), []);
  const { data: memoryStats, loading: memoryLoading } = useApiData(() => getMemoryStats(), []);
  const { data: providerData } = useApiData(() => listProviders(), []);
  const { data: findingsData, loading: findingsLoading } = useApiData(() => getWatchFindings(), []);
  const { data: healthData, loading: healthLoading } = useApiData(() => getMonitorHealth(), []);

  const fetchSuggestions = useCallback(
    () => getSuggestions(repoName, 6),
    [repoName]
  );
  const { data: suggestionsData, loading: suggestionsLoading } = useApiData(fetchSuggestions, [repoName]);

  const fetchRecentMemories = useCallback(
    () => searchMemories("architecture decision convention pattern", { limit: 4 }),
    []
  );
  const { data: recentMemoriesData } = useApiData(fetchRecentMemories, []);

  const allModels = (providerData?.providers ?? []).flatMap(p =>
    p.models.filter(m => m.enabled).map(m => ({ id: m.id, displayName: m.displayName, provider: p.name }))
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [agentOn, setAgentOn] = useState(true);
  const [subAgOn, setSubAgOn] = useState(false);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

  useEffect(() => {
    setAgentOn(localStorage.getItem("tf_agentMode") !== "false");
    setSubAgOn(localStorage.getItem("tf_subAgents") === "true");
  }, []);
  useEffect(() => { localStorage.setItem("tf_agentMode", String(agentOn)); }, [agentOn]);
  useEffect(() => { localStorage.setItem("tf_subAgents", String(subAgOn)); }, [subAgOn]);

  const statsLoading = taskLoading || costLoading || auditLoading;
  const tokensToday = Number(costData?.today?.tokens ?? 0) || 0;
  const costToday = Number(costData?.today?.total ?? 0) || 0;
  const activeTasks = taskStats
    ? (taskStats.byStatus?.["in_progress"] ?? 0) + (taskStats.byStatus?.["active"] ?? 0)
    : 0;
  const successRate = auditStats?.successRate ?? 0;

  const allSkills = skillsData?.skills ?? [];
  const selectedSkills = allSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }));

  const totalMemories = memoryStats?.total ?? 0;
  const byType = memoryStats?.byType ?? {};
  const memCategories = Object.entries(byType).sort(([, a], [, b]) => b - a);

  const suggestions = suggestionsData?.suggestions ?? [];
  const findings = (findingsData?.findings ?? []).slice(0, 6);
  const recentMemories = recentMemoriesData?.results ?? [];

  // Health summary across all repos
  const healthRepos = Object.entries(healthData?.repos ?? {});
  const healthPassing = healthRepos.flatMap(([, checks]) => checks).filter(c => c.status === "pass").length;
  const healthFailing = healthRepos.flatMap(([, checks]) => checks).filter(c => c.status === "fail").length;
  const healthWarning = healthRepos.flatMap(([, checks]) => checks).filter(c => c.status === "warn").length;

  const onStartChat = (msg: string) => {
    const params = new URLSearchParams();
    if (msg) params.set("msg", msg);
    if (selectedRepo) params.set("repo", selectedRepo.name);
    if (selectedSkillIds.length > 0) params.set("skills", selectedSkillIds.join(","));
    if (subAgOn) params.set("subagents", "1");
    router.push(`/chat?${params.toString()}`);
  };

  return (
    <>
      {/* Chat composer */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <ChatComposer
          heading="Når AI sier umulig, sier TheFold neste"
          onSubmit={onStartChat}
          skills={selectedSkills}
          selectedSkillIds={selectedSkillIds}
          onSkillsChange={setSelectedSkillIds}
          subAgentsEnabled={subAgOn}
          onSubAgentsToggle={() => setSubAgOn(p => !p)}
          models={allModels}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>

      {/* Top stats */}
      <GR>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
          borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden", marginTop: 20,
        }}>
          {[
            { label: "TOKENS I DAG", value: statsLoading ? "—" : fmt(tokensToday), color: T.success },
            { label: "KOSTNAD", value: statsLoading ? "—" : `$${costToday.toFixed(2)}`, color: T.error },
            { label: "AKTIVE TASKS", value: statsLoading ? "—" : String(activeTasks) },
            { label: "SUCCESS RATE", value: statsLoading ? "—" : `${Math.round(successRate)}%`, color: T.success },
          ].map((s, i) => (
            <div key={i} style={{ borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
              <StatCard {...s} loading={statsLoading} />
            </div>
          ))}
        </div>
      </GR>

      {/* Row 2: Suggestions + Watch findings */}
      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          {/* AI Suggestions */}
          <Panel>
            <PanelHeader
              title="AI-anbefalinger"
              count={suggestions.length}
              action={
                <Link href="/chat" style={{ fontSize: 10, color: T.accent, fontFamily: T.mono, textDecoration: "none" }}>
                  Ny samtale →
                </Link>
              }
            />
            {suggestionsLoading ? (
              <div style={{ padding: "10px 16px" }}>
                <Skeleton rows={3} height={14} />
              </div>
            ) : suggestions.length === 0 ? (
              <EmptyRow text="Ingen anbefalinger — alt ser bra ut" />
            ) : (
              suggestions.map((s) => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{typeIcon(s.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: priorityColor(s.priority), flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.title}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: T.textMuted, margin: "3px 0 0", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {s.description}
                    </p>
                  </div>
                  {s.actionLabel && s.actionTaskDescription && (
                    <button
                      onClick={() => onStartChat(s.actionTaskDescription!)}
                      style={{ flexShrink: 0, padding: "3px 10px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 10, color: T.accent, cursor: "pointer", fontFamily: T.mono, whiteSpace: "nowrap" }}
                    >
                      {s.actionLabel}
                    </button>
                  )}
                </div>
              ))
            )}
          </Panel>

          {/* Repo-watch findings */}
          <Panel>
            <PanelHeader
              title="Repo-watch"
              count={findings.length}
              action={
                <Link href="/monitor" style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, textDecoration: "none" }}>
                  Se alt →
                </Link>
              }
            />
            {/* Health bar */}
            {!healthLoading && healthRepos.length > 0 && (
              <div style={{ display: "flex", gap: 16, padding: "8px 16px", borderBottom: `1px solid ${T.border}`, background: T.subtle }}>
                {[
                  { label: "PASS", val: healthPassing, c: T.success },
                  { label: "WARN", val: healthWarning, c: T.warning },
                  { label: "FAIL", val: healthFailing, c: T.error },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.c }} />
                    <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.mono }}>{s.val} {s.label}</span>
                  </div>
                ))}
              </div>
            )}
            {findingsLoading ? (
              <div style={{ padding: "10px 16px" }}>
                <Skeleton rows={3} height={14} />
              </div>
            ) : findings.length === 0 ? (
              <EmptyRow text="Ingen nye funn siste 7 dager" />
            ) : (
              findings.map((f) => (
                <div key={f.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "9px 16px", borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor(f.severity), flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>
                        {f.repo.split("/")[1] || f.repo}
                      </span>
                      <span style={{ fontSize: 10, color: severityColor(f.severity), fontFamily: T.mono, textTransform: "uppercase" }}>
                        {f.findingType.replace("_", " ")}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: T.textSec, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.summary}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, flexShrink: 0 }}>
                    {rel(f.createdAt)}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </GR>

      {/* Row 3: Memory overview + Recent tasks */}
      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          {/* Memory overview */}
          <Panel>
            <PanelHeader
              title="Agentens hukommelse"
              count={totalMemories}
              action={
                <Link href="/knowledge" style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, textDecoration: "none" }}>
                  Se alle →
                </Link>
              }
            />
            {memoryLoading ? (
              <div style={{ padding: "10px 16px" }}>
                <Skeleton rows={4} height={12} />
              </div>
            ) : (
              <>
                {/* Category bar */}
                {memCategories.length > 0 && (
                  <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {memCategories.map(([type, count]) => (
                        <div key={type} style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 8px", borderRadius: 999,
                          border: `1px solid ${T.border}`, background: T.subtle,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: MEM_TYPE_COLORS[type] || T.textFaint }} />
                          <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.mono }}>{type}</span>
                          <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Recent memories */}
                {recentMemories.length > 0 ? (
                  recentMemories.map((m) => (
                    <div key={m.id} style={{
                      padding: "9px 16px", borderBottom: `1px solid ${T.border}`,
                      display: "flex", alignItems: "flex-start", gap: 8,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: MEM_TYPE_COLORS[m.memoryType] || T.textFaint,
                        flexShrink: 0, marginTop: 5,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, color: T.textSec, margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {m.content}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, flexShrink: 0 }}>
                        {rel(m.createdAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyRow text="Ingen minner enda" />
                )}
              </>
            )}
          </Panel>

          {/* Recent tasks */}
          <Panel>
            <PanelHeader
              title="Tasks"
              action={
                <Link href="/tasks" style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, textDecoration: "none" }}>
                  Se alle →
                </Link>
              }
            />
            {tasksLoading ? (
              <div style={{ padding: "10px 16px" }}>
                <Skeleton rows={5} height={14} />
              </div>
            ) : (recentTasksData?.tasks ?? []).length === 0 ? (
              <EmptyRow text="Ingen tasks enda" />
            ) : (
              (recentTasksData?.tasks ?? []).map((task) => (
                <div key={task.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 16px", borderBottom: `1px solid ${T.border}`,
                  cursor: "pointer",
                }} onClick={() => router.push("/tasks")}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(task.status), flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: T.textSec, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.title}
                  </span>
                  <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, flexShrink: 0 }}>
                    {rel(task.updatedAt)}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </GR>

      {/* Row 4: Skills + Controls + Quick actions */}
      <GR mb={40}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
          {/* Skills */}
          <Panel>
            <PanelHeader title="Skills" />
            {skillsLoading ? (
              <div style={{ padding: "10px 16px" }}>
                <Skeleton rows={3} height={12} />
              </div>
            ) : (
              <>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>AKTIVE</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.text }}>
                      {allSkills.filter(s => s.enabled).length}/{allSkills.length}
                    </div>
                  </div>
                </div>
                {allSkills.sort((a, b) => (b.totalUses ?? 0) - (a.totalUses ?? 0)).slice(0, 4).map((sk) => (
                  <div key={sk.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 16px", borderBottom: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: 12, color: T.textSec }}>{sk.name}</span>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{sk.totalUses ?? 0}x</span>
                  </div>
                ))}
              </>
            )}
          </Panel>

          {/* Controls */}
          <Panel>
            <PanelHeader title="Kontroller" />
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <Toggle checked={agentOn} onChange={setAgentOn} label="Agent-modus" />
              <Toggle checked={subAgOn} onChange={setSubAgOn} label="Sub-agenter" />
            </div>
          </Panel>

          {/* Quick actions */}
          <Panel>
            <PanelHeader title="Hurtigvalg" />
            <div style={{ padding: "10px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { label: "Start ny samtale", href: "/chat", accent: true },
                { label: "Se alle tasks", href: "/tasks" },
                { label: "Se alle minner", href: "/knowledge" },
                { label: "Monitor / Repo health", href: "/monitor" },
                { label: "Memory-søk", href: "/memory" },
              ].map((a) => (
                <Link key={a.href} href={a.href} style={{ textDecoration: "none" }}>
                  <div style={{
                    padding: "9px 14px", borderRadius: 8, cursor: "pointer",
                    background: "transparent", transition: "background 0.1s",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.subtle)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontSize: 12, color: a.accent ? T.accent : T.textSec }}>{a.label}</span>
                    <span style={{ fontSize: 12, color: T.textFaint }}>→</span>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </GR>
    </>
  );
}
