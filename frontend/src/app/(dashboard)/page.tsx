"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { T, Layout } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { getTaskStats, getCostSummary, listTheFoldTasks, getAuditStats, listSkills, getMemoryStats } from "@/lib/api";
import ChatComposer from "@/components/ChatComposer";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Toggle from "@/components/Toggle";
import Skeleton from "@/components/Skeleton";

function formatTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function statusColor(status: string): string {
  switch (status) {
    case "done":
    case "completed":
      return T.success;
    case "in_progress":
    case "active":
      return T.accent;
    case "failed":
    case "blocked":
      return T.error;
    case "in_review":
      return T.brandLight;
    default:
      return T.textMuted;
  }
}

export default function OverviewPage() {
  const router = useRouter();

  const { data: taskStats, loading: taskLoading } = useApiData(() => getTaskStats(), []);
  const { data: costData, loading: costLoading } = useApiData(() => getCostSummary(), []);
  const { data: recentTasks, loading: tasksLoading } = useApiData(() => listTheFoldTasks({ limit: 4 }), []);
  const { data: auditStats, loading: auditLoading } = useApiData(() => getAuditStats(), []);
  const { data: skillsData, loading: skillsLoading } = useApiData(() => listSkills(), []);
  const { data: memoryStats, loading: memoryLoading } = useApiData(() => getMemoryStats(), []);

  const [agentOn, setAgentOn] = useState(true);
  const [subAgOn, setSubAgOn] = useState(false);
  const [privat, setPrivat] = useState(false);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

  // Les fra localStorage etter hydration
  useEffect(() => {
    setAgentOn(localStorage.getItem("tf_agentMode") !== "false");
    setSubAgOn(localStorage.getItem("tf_subAgents") === "true");
    setPrivat(localStorage.getItem("tf_private") === "true");
  }, []);

  useEffect(() => { localStorage.setItem("tf_agentMode", String(agentOn)); }, [agentOn]);
  useEffect(() => { localStorage.setItem("tf_subAgents", String(subAgOn)); }, [subAgOn]);
  useEffect(() => { localStorage.setItem("tf_private", String(privat)); }, [privat]);

  const tokensToday = Number(costData?.today?.tokens ?? 0) || 0;
  const costToday = Number(costData?.today?.total ?? 0) || 0;
  const activeTasks = taskStats
    ? (taskStats.byStatus?.["in_progress"] ?? 0) + (taskStats.byStatus?.["active"] ?? 0)
    : 0;
  const successRate = auditStats?.successRate ?? 0;

  const statsLoading = taskLoading || costLoading || auditLoading;

  const onStartChat = (msg: string, repo: string | null, ghost: boolean) => {
    const params = new URLSearchParams();
    if (msg) params.set("msg", msg);
    if (repo) params.set("repo", repo);
    if (ghost) params.set("ghost", "1");
    if (selectedSkillIds.length > 0) params.set("skills", selectedSkillIds.join(","));
    if (subAgOn) params.set("subagents", "1");
    router.push(`/chat?${params.toString()}`);
  };

  // Skills data
  const allSkills = skillsData?.skills ?? [];
  const activeSkillCount = allSkills.filter((s) => s.enabled).length;
  const topSkills = [...allSkills].sort((a, b) => (b.totalUses ?? 0) - (a.totalUses ?? 0)).slice(0, 3);

  // Memory data
  const totalMemories = memoryStats?.total ?? 0;
  const codePatterns = memoryStats?.byType?.["code_pattern"] ?? 0;
  const byType = memoryStats?.byType ?? {};
  const topCategories = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const SP = Layout.sidePadding;

  return (
    <>
      <div style={{ margin: `0 -${SP}px`, position: "relative", zIndex: 1 }}>
        <ChatComposer
          heading="Når AI sier umulig, sier Mikael Kråkenes neste"
          onSubmit={(msg, repo, ghost) => onStartChat(msg, repo, ghost)}
          defaultGhost={privat}
          onGhostChange={(g) => setPrivat(g)}
          skills={allSkills.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }))}
          selectedSkillIds={selectedSkillIds}
          onSkillsChange={setSelectedSkillIds}
          subAgentsEnabled={subAgOn}
          onSubAgentsToggle={() => setSubAgOn(p => !p)}
        />
      </div>

      {/* Stats grid */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            position: "relative",
            overflow: "hidden",
          }}
        >

          {[
            {
              l: "TOKENS I DAG",
              v: statsLoading ? "—" : formatTokens(tokensToday),
              t: undefined as string | undefined,
              c: T.success,
            },
            {
              l: "KOSTNAD",
              v: statsLoading ? "—" : `$${costToday.toFixed(2)}`,
              t: undefined as string | undefined,
              c: T.error,
            },
            {
              l: "AKTIVE TASKS",
              v: statsLoading ? "—" : String(activeTasks),
              t: undefined as string | undefined,
              c: undefined as string | undefined,
            },
            {
              l: "SUCCESS RATE",
              v: statsLoading ? "—" : `${Math.round(successRate)}%`,
              t: undefined as string | undefined,
              c: T.success,
            },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: "18px 24px",
                borderRight: i < 3 ? `1px solid ${T.border}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: T.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                {s.l}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: T.text,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {s.v}
              </div>
              {s.t && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontFamily: T.mono,
                    color: s.c,
                  }}
                >
                  {s.t}
                </div>
              )}
            </div>
          ))}
        </div>
      </GR>

      {/* Activity + Controls */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            border: `1px solid ${T.border}`,
            borderTop: "none",
            borderRadius: `0 0 ${T.r}px ${T.r}px`,
            position: "relative",
            overflow: "hidden",
          }}
        >

          <div style={{ padding: 20, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>SISTE AKTIVITET</SectionLabel>
            {tasksLoading ? (
              <Skeleton rows={4} height={16} style={{ padding: "7px 0" }} />
            ) : recentTasks?.tasks && recentTasks.tasks.length > 0 ? (
              recentTasks.tasks.map((task, i) => (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 0",
                    borderBottom: i < recentTasks.tasks.length - 1 ? `1px solid ${T.border}` : "none",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: statusColor(task.status),
                    }}
                  />
                  <span style={{ fontSize: 12, color: T.textSec, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.title}
                  </span>
                  <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>
                    {relativeTime(task.updatedAt)}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: T.textMuted, padding: "7px 0" }}>Ingen aktivitet enda</div>
            )}
          </div>
          <div style={{ padding: 20 }}>
            <SectionLabel>KONTROLLER</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Toggle checked={agentOn} onChange={setAgentOn} label="Agent-modus" />
              <Toggle checked={subAgOn} onChange={setSubAgOn} label="Sub-agenter" />
              <Toggle checked={privat} onChange={setPrivat} label="Privat" />
            </div>
          </div>
        </div>
      </GR>

      {/* Skills + Memory */}
      <GR mb={40}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            border: `1px solid ${T.border}`,
            borderTop: "none",
            borderRadius: `0 0 ${T.r}px ${T.r}px`,
            position: "relative",
            overflow: "hidden",
          }}
        >

          <div style={{ padding: 20, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>SKILLS</SectionLabel>
            {skillsLoading ? (
              <Skeleton rows={4} height={14} />
            ) : (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>AKTIVE</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.text }}>{activeSkillCount}/{allSkills.length}</div>
                  </div>
                </div>
                {topSkills.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>MEST BRUKT</div>
                    {topSkills.map((sk) => (
                      <div key={sk.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: 12, color: T.textSec }}>{sk.name}</span>
                        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{sk.totalUses ?? 0}x</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          <div style={{ padding: 20 }}>
            <SectionLabel>MEMORY</SectionLabel>
            {memoryLoading ? (
              <Skeleton rows={4} height={14} />
            ) : (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>MINNER</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.text }}>{totalMemories}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 2 }}>KODE-MØNSTRE</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.text }}>{codePatterns}</div>
                  </div>
                </div>
                {topCategories.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", marginBottom: 6 }}>TOPP KATEGORIER</div>
                    {topCategories.map(([type, count]) => (
                      <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: 12, color: T.textSec }}>{type}</span>
                        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{count}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </GR>
    </>
  );
}
