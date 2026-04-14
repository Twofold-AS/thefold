"use client";

import { useState, useCallback } from "react";
import { T, S } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import StatCard from "@/components/shared/StatCard";

import { Play, Pause, Square, ChevronDown, ChevronUp, FileText, Clock, Terminal, Send } from "lucide-react";
import {
  listTheFoldTasks,
  listRepos,
  listReviews,
  getTaskStats,
  sendMessage,
  type TheFoldTask,
} from "@/lib/api";
import { useRepoContext } from "@/lib/repo-context";

type SecurityLevel = "standard" | "strict" | "paranoid";

const SECURITY_DESCRIPTIONS: Record<SecurityLevel, string> = {
  standard: "AI bestemmer, review ved score <7",
  strict: "Alltid review, ingen force push",
  paranoid: "Review alt, manuell godkjenning kreves",
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  return `${Math.floor(h / 24)}d`;
}

type TaskTab = "detaljer" | "rapporter" | "logg";

function ExpandableTask({ task }: { task: TheFoldTask }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskTab>("detaljer");

  const statusColor = {
    done: T.success,
    in_progress: T.accent,
    backlog: T.textMuted,
    planned: T.infoA10,
    blocked: T.error,
    in_review: T.warning,
    failed: T.error,
  }[task.status] ?? T.textMuted;

  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: T.r,
      overflow: "hidden",
    }}>
      {/* Task header — always visible */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          padding: `${S.md}px ${S.lg}px`,
          display: "flex",
          alignItems: "center",
          gap: S.sm,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.title}
          </div>
          <div style={{ display: "flex", gap: S.sm, marginTop: 4, alignItems: "center" }}>
            {task.repo && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{task.repo}</span>
            )}
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{task.source}</span>
            {task.complexity != null && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                kompleksitet: {task.complexity}
              </span>
            )}
          </div>
        </div>
        <Tag variant={task.status === "done" ? "accent" : task.status === "blocked" || task.status === "failed" ? "error" : "default"}>
          {task.status}
        </Tag>
        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
          {task.createdAt ? timeAgo(task.createdAt) : ""}
        </span>
        {expanded ? <ChevronUp size={16} color={T.textMuted} /> : <ChevronDown size={16} color={T.textMuted} />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {/* Horizontal tab menu — square borders */}
          <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
            {([
              { id: "detaljer" as TaskTab, label: "Detaljer", icon: <FileText size={12} /> },
              { id: "rapporter" as TaskTab, label: "Rapporter", icon: <Terminal size={12} /> },
              { id: "logg" as TaskTab, label: "Logg", icon: <Clock size={12} /> },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  fontSize: 12,
                  fontFamily: T.mono,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: activeTab === tab.id ? T.subtle : "transparent",
                  color: activeTab === tab.id ? T.text : T.textMuted,
                  border: "none",
                  borderRight: `1px solid ${T.border}`,
                  borderRadius: 0,
                  cursor: "pointer",
                  fontWeight: activeTab === tab.id ? 500 : 400,
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: S.lg }}>
            {activeTab === "detaljer" && (
              <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6 }}>
                  {task.description || "Ingen beskrivelse tilgjengelig."}
                </div>
                <div style={{ display: "flex", gap: S.lg, marginTop: S.sm, fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
                  <span>ID: {task.id.slice(0, 8)}</span>
                  <span>Kilde: {task.source}</span>
                  {task.estimatedTokens && <span>Estimert: ~{task.estimatedTokens} tokens</span>}
                </div>
              </div>
            )}
            {activeTab === "rapporter" && (
              <div style={{ fontSize: 13, color: T.textMuted }}>
                {task.status === "done"
                  ? "Oppgaven er fullført. Detaljert rapport er tilgjengelig i review-seksjonen."
                  : "Rapport genereres når oppgaven er fullført."}
              </div>
            )}
            {activeTab === "logg" && (
              <div style={{ fontSize: 12, fontFamily: T.mono, color: T.textMuted, lineHeight: 1.6 }}>
                <div>Opprettet: {task.createdAt ? new Date(task.createdAt).toLocaleString("nb-NO") : "—"}</div>
                {task.updatedAt && <div>Oppdatert: {new Date(task.updatedAt).toLocaleString("nb-NO")}</div>}
                <div>Status: {task.status}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MuninnPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>("standard");

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Chat input
  const [chatMsg, setChatMsg] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const { selectedRepo } = useRepoContext();
  const { data: taskData, loading: tasksLoading, refresh: refreshTasks } = useApiData(() => listTheFoldTasks({ limit: 30 }), []);
  const { data: repoData } = useApiData(() => listRepos(), []);
  const { data: statsData } = useApiData(() => getTaskStats(), []);
  const { data: reviewData } = useApiData(() => listReviews({ status: "pending_review", limit: 5 }), []);

  const repos = repoData?.repos?.map((r: any) => r.name) ?? [];
  // Filter out completed tasks — Auto should only show active/queued work
  const allTasks: TheFoldTask[] = (taskData?.tasks ?? []).filter(
    (t: TheFoldTask) => t.status !== "done" && t.status !== "completed"
  );
  const pendingReviews = reviewData?.reviews ?? [];
  const totalTasks = statsData?.total ?? 0;
  const completedTasks = statsData?.byStatus?.done ?? 0;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    fontSize: 13,
    fontFamily: T.sans,
    background: T.subtle,
    color: T.text,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    outline: "none",
  };

  const handleSendChat = async () => {
    if (!chatMsg.trim() || chatSending) return;
    setChatSending(true);
    try {
      const convId = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await sendMessage(convId, chatMsg, {
        repoName: newRepo || selectedRepo?.name || undefined,
      });
      setChatMsg("");
    } catch {
      // Non-critical
    } finally {
      setChatSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${S.lg}px ${S.xl}px ${S.xxl}px` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: S.xl }}>

          {/* Header */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0 }}>Auto</h1>
              <span style={{
                fontSize: 10, fontFamily: T.mono, fontWeight: 600,
                color: T.warning, background: `${T.warningA0}40`,
                padding: "2px 8px", borderRadius: 4,
              }}>
                BETA
              </span>
            </div>
            <p style={{ fontSize: 13, color: T.textMuted, marginTop: S.xs }}>
              Autonom modus — TheFold jobber selvstendig, tester og validerer uten reviews. Du far en rapport til slutt.
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: S.md }}>
            <StatCard label="Oppgaver totalt" value={totalTasks} />
            <StatCard label="Ventende reviews" value={pendingReviews.length} color="warning" />
            <StatCard label="Fullførte" value={completedTasks} color="success" />
            <StatCard
              label="Status"
              value={isRunning ? (isPaused ? "Pauset" : "Kjører") : "Inaktiv"}
              color={isRunning ? (isPaused ? "warning" : "success") : "default"}
            />
          </div>

          {/* Control + New task — side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.lg }}>
            {/* Control panel */}
            <div style={{
              background: T.raised, border: `1px solid ${T.border}`,
              borderRadius: T.r, padding: S.lg,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Kontrollpanel</div>

              {/* Control buttons — TabWrapper style */}
              <div style={{ display: "flex", background: T.tabWrapper, borderRadius: 12, padding: 4, gap: 4, marginBottom: S.lg }}>
                <button
                  onClick={() => { if (!isRunning) { setIsRunning(true); setIsPaused(false); } }}
                  style={{
                    flex: 1, padding: "8px 12px", fontSize: 13, fontWeight: 500, fontFamily: T.sans,
                    color: isRunning && !isPaused ? T.text : T.textMuted,
                    background: isRunning && !isPaused ? T.tabActive : "transparent",
                    border: "none", borderRadius: 10, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <Play size={13} /> Start
                </button>
                <button
                  onClick={() => { if (isRunning) setIsPaused(!isPaused); }}
                  style={{
                    flex: 1, padding: "8px 12px", fontSize: 13, fontWeight: 500, fontFamily: T.sans,
                    color: isPaused ? T.text : T.textMuted,
                    background: isPaused ? T.tabActive : "transparent",
                    border: "none", borderRadius: 10, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <Pause size={13} /> Pause
                </button>
                <button
                  onClick={() => { setIsRunning(false); setIsPaused(false); }}
                  style={{
                    flex: 1, padding: "8px 12px", fontSize: 13, fontWeight: 500, fontFamily: T.sans,
                    color: !isRunning && !isPaused ? T.textMuted : T.textMuted,
                    background: "transparent",
                    border: "none", borderRadius: 10, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <Square size={13} /> Stopp
                </button>
              </div>

              {/* Security level — TabWrapper style */}
              <div style={{ marginBottom: S.md }}>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: S.xs }}>Sikkerhetsnivå</div>
                <div style={{ display: "flex", background: T.tabWrapper, borderRadius: 12, padding: 4, gap: 4 }}>
                  {(["standard", "strict", "paranoid"] as SecurityLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setSecurityLevel(level)}
                      style={{
                        flex: 1, padding: "8px 12px", fontSize: 12, fontFamily: T.sans,
                        textTransform: "capitalize",
                        background: securityLevel === level ? T.tabActive : "transparent",
                        color: securityLevel === level ? T.text : T.textMuted,
                        border: "none", borderRadius: 10,
                        cursor: "pointer", fontWeight: securityLevel === level ? 500 : 400,
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: T.textFaint, marginTop: S.xs }}>
                  {SECURITY_DESCRIPTIONS[securityLevel]}
                </p>
              </div>
            </div>

            {/* New task form */}
            <div style={{
              background: T.raised, border: `1px solid ${T.border}`,
              borderRadius: T.r, padding: S.lg,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>
                Ny autonom oppgave
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Oppgavetittel..." style={inputStyle} />
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Beskrivelse (valgfritt)..." rows={3}
                  style={{ ...inputStyle, resize: "vertical" as const }} />
                <select value={newRepo} onChange={(e) => setNewRepo(e.target.value)} style={inputStyle}>
                  <option value="">Velg repo</option>
                  {repos.map((r: string) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Btn variant="primary" icon={<Play size={14} />} loading={submitting} disabled={!newTitle.trim()}
                    onClick={async () => {
                      setSubmitting(true);
                      await new Promise(r => setTimeout(r, 1000));
                      setSubmitting(false); setNewTitle(""); setNewDesc("");
                    }}>
                    Start Auto
                  </Btn>
                </div>
              </div>
            </div>
          </div>

          {/* Tasks are now selected from the sidebar — no task list here */}
        </div>
      </div>

      {/* Chat input at bottom */}
      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: `${S.md}px ${S.xl}px`,
        flexShrink: 0,
        borderTop: `1px solid ${T.border}`,
        background: "transparent",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex", gap: S.sm, alignItems: "center",
        }}>
          <div style={{
            flex: 1,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            background: "transparent",
            overflow: "hidden",
          }}>
            {/* Repo chip */}
            {(newRepo || selectedRepo?.name) && (
              <span style={{
                fontSize: 11, fontFamily: T.mono, color: T.textMuted,
                padding: "6px 10px", borderRight: `1px solid ${T.border}`,
                whiteSpace: "nowrap",
              }}>
                {newRepo || selectedRepo?.name}
              </span>
            )}
            <input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
              placeholder="Skriv til Auto-agenten..."
              style={{
                flex: 1, padding: "10px 14px", fontSize: 13,
                fontFamily: T.sans, background: "transparent",
                color: T.text, border: "none", outline: "none",
              }}
            />
          </div>
          <Btn variant="primary" icon={<Send size={14} />} loading={chatSending} onClick={handleSendChat} disabled={!chatMsg.trim()}>
            Send
          </Btn>
        </div>
      </div>
    </div>
  );
}
