"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import { useApiData } from "@/lib/hooks";
import Skeleton from "@/components/Skeleton";
import TabBar from "@/components/shared/TabBar";
import { RefreshCw, Trash2, ChevronDown, Pencil } from "lucide-react";
import TaskEditor from "@/components/tasks/TaskEditor";
import LinearSync from "@/components/tasks/LinearSync";
import ExpandableTaskCard from "@/components/tasks/ExpandableTaskCard";
import TabWrapper from "@/components/TabWrapper";
import { S } from "@/lib/tokens";
import {
  listTheFoldTasks,
  listReviews,
  syncLinearTasks,
  approveReview,
  requestReviewChanges,
  rejectReview,
  createTask,
  softDeleteTask,
  listRepos,
  listSkills,
  type TheFoldTask,
  type ReviewSummary,
} from "@/lib/api";

function timeAgo(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "na";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mnd`;
}

function mapStatus(status: string): "done" | "active" | "pending" {
  if (status === "done" || status === "completed") return "done";
  if (status === "in_progress" || status === "in_review") return "active";
  return "pending";
}

function statusLabel(status: string): string {
  switch (status) {
    case "done":
    case "completed":
      return "done";
    case "in_progress":
      return "aktiv";
    case "in_review":
      return "review";
    case "planned":
      return "planlagt";
    case "backlog":
      return "backlog";
    case "blocked":
      return "blokkert";
    default:
      return status;
  }
}

const inputStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 13,
  color: T.text,
  fontFamily: T.sans,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 100,
  resize: "vertical" as const,
};

export default function TasksPage() {
  const [taskTab, setTaskTab] = useState<"tasks" | "reviews" | "linear">("tasks");
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [creating, setCreating] = useState(false);
  const [repoDropOpen, setRepoDropOpen] = useState(false);

  const { data: taskData, loading: tasksLoading, refresh: refreshTasks } = useApiData(
    () => listTheFoldTasks(),
    [],
  );
  const { data: reviewData } = useApiData(() => listReviews({}), []);
  const { data: repoData } = useApiData(() => listRepos(), []);
  const { data: skillsData } = useApiData(() => listSkills(), []);
  const dynamicRepos = repoData?.repos?.map(r => r.name) ?? [];
  const availableSkills = (skillsData?.skills ?? []).filter(s => s.enabled);
  const [newSkillIds, setNewSkillIds] = useState<string[]>([]);

  const tasks: TheFoldTask[] = taskData?.tasks ?? [];
  const reviews: ReviewSummary[] = reviewData?.reviews ?? [];

  const t = sel !== null ? tasks.find((x) => x.id === sel) : null;
  const tReview = t ? reviews.find((r) => r.taskId === t.id) : null;
  const tStatus = t ? mapStatus(t.status) : "pending";

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncLinearTasks();
      alert(`Linear sync: ${result.created} opprettet, ${result.updated} oppdatert (${result.total} totalt)`);
      refreshTasks();
    } catch (e) {
      alert(`Sync feilet: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleApprove = async () => {
    const reviewId = t?.reviewId || tReview?.id;
    if (!reviewId) {
      alert("Ingen review tilgjengelig for denne oppgaven.");
      return;
    }
    setActionLoading("approve");
    try {
      const result = await approveReview(reviewId);
      alert(`Godkjent! PR: ${result.prUrl}`);
      refreshTasks();
    } catch (e) {
      alert(`Feil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestChanges = async () => {
    const reviewId = t?.reviewId || tReview?.id;
    if (!reviewId) {
      alert("Ingen review tilgjengelig for denne oppgaven.");
      return;
    }
    const feedback = prompt("Hva skal endres?");
    if (!feedback) return;
    setActionLoading("changes");
    try {
      await requestReviewChanges(reviewId, feedback);
      alert("Endringer forespurt.");
      refreshTasks();
    } catch (e) {
      alert(`Feil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    const reviewId = t?.reviewId || tReview?.id;
    if (!reviewId) {
      alert("Ingen review tilgjengelig for denne oppgaven.");
      return;
    }
    const reason = prompt("Grunn for avvisning (valgfritt):");
    setActionLoading("reject");
    try {
      await rejectReview(reviewId, reason || undefined);
      alert("Avvist.");
      refreshTasks();
    } catch (e) {
      alert(`Feil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createTask({
        title: newTitle,
        description: newDesc,
        repo: newRepo || dynamicRepos[0] || undefined,
        labels: newSkillIds.length > 0 ? newSkillIds.map(id => {
          const sk = availableSkills.find(s => s.id === id);
          return sk ? `skill:${sk.name}` : "";
        }).filter(Boolean) : undefined,
      });
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setNewRepo(dynamicRepos[0] || "");
      setNewSkillIds([]);
      refreshTasks();
    } catch (e) {
      alert(`Feil ved opprettelse: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <style>{`
        .task-row .task-id, .task-row .task-delete { opacity: 0; transition: opacity 0.15s; }
        .task-row:hover .task-id, .task-row:hover .task-delete { opacity: 1; }
      `}</style>
      <div style={{ paddingTop: 0, paddingBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: T.text,
                letterSpacing: "-0.03em",
                marginBottom: 8,
              }}
            >
              Oppgaver
            </h2>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Oppgaver utført av agenten med kvalitetsrapport.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn sm onClick={() => setShowCreate(true)}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{ marginRight: 4 }}
              >
                <path
                  d="M7 1v12M1 7h12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Ny task
            </Btn>
            <Btn sm onClick={handleSync}>
              <RefreshCw size={14} style={{ marginRight: 4 }} />
              {syncing ? "Synkroniserer..." : "Importer fra Linear"}
            </Btn>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: S.lg }}>
        <TabWrapper
          tabs={[
            { id: "tasks", label: "Oppgaver", count: tasks.length },
            { id: "reviews", label: "Reviews", count: reviews.filter(r => r.status === "pending" || r.status === "pending_review").length },
            { id: "linear", label: "Linear" },
          ]}
          active={taskTab}
          onChange={(id) => setTaskTab(id as "tasks" | "reviews" | "linear")}
        />
      </div>

      {taskTab === "linear" && (
        <GR mb={40}>
          <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>Linear Sync</div>
            <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>
              Synkroniser oppgaver fra Linear. Bruk &quot;Importer fra Linear&quot;-knappen ovenfor.
            </p>
            <Btn primary sm onClick={handleSync}>
              <RefreshCw size={14} style={{ marginRight: 4 }} />
              {syncing ? "Synkroniserer..." : "Synkroniser nå"}
            </Btn>
          </div>
        </GR>
      )}

      {taskTab === "reviews" && (
        <GR mb={40}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reviews.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: T.textMuted, fontSize: 13, border: `1px solid ${T.border}`, borderRadius: T.r }}>
                Ingen reviews ennå
              </div>
            ) : (
              reviews.map((r) => {
                const task = tasks.find(tk => tk.id === r.taskId);
                return (
                  <ExpandableTaskCard
                    key={r.id}
                    task={{
                      id: r.id,
                      title: task?.title || r.taskId,
                      description: task?.description || `Review — ${r.fileCount} filer, kvalitet: ${r.qualityScore ?? "—"}/10`,
                      status: r.status === "pending" || r.status === "pending_review" ? "in_review" : r.status === "approved" ? "done" : r.status,
                      source: "review",
                      repo: task?.repo,
                      reviewId: r.id,
                      createdAt: task?.createdAt,
                    }}
                    showReviewActions={r.status === "pending" || r.status === "pending_review"}
                    onApprove={async (revId) => {
                      setActionLoading(`approve-${revId}`);
                      try { await approveReview(revId); refreshTasks(); } catch {} finally { setActionLoading(null); }
                    }}
                    onReject={async (revId) => {
                      const reason = prompt("Begrunnelse for avvisning:");
                      if (!reason) return;
                      setActionLoading(`reject-${revId}`);
                      try { await rejectReview(revId, reason); refreshTasks(); } catch {} finally { setActionLoading(null); }
                    }}
                    onRequestChanges={async (revId) => {
                      const feedback = prompt("Hva skal endres?");
                      if (!feedback) return;
                      setActionLoading(`changes-${revId}`);
                      try { await requestReviewChanges(revId, feedback); refreshTasks(); } catch {} finally { setActionLoading(null); }
                    }}
                  />
                );
              })
            )}
          </div>
        </GR>
      )}

      {taskTab === "tasks" && (
        <GR mb={40}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasksLoading ? (
              <div style={{ padding: "40px 20px" }}>
                <Skeleton rows={5} />
              </div>
            ) : tasks.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: T.textMuted, fontSize: 13, border: `1px solid ${T.border}`, borderRadius: T.r }}>
                Ingen oppgaver ennå
              </div>
            ) : (
              tasks.map((tk) => (
                <ExpandableTaskCard
                  key={tk.id}
                  task={{
                    id: tk.id,
                    title: tk.title,
                    description: tk.description,
                    status: tk.status,
                    source: tk.source,
                    repo: tk.repo,
                    complexity: tk.complexity,
                    estimatedTokens: tk.estimatedTokens,
                    createdAt: tk.createdAt,
                    updatedAt: tk.updatedAt,
                    reviewId: tk.reviewId || reviews.find(r => r.taskId === tk.id)?.id,
                    prUrl: tk.prUrl,
                    errorMessage: tk.errorMessage,
                  }}
                  review={(() => {
                    const rev = reviews.find(r => r.taskId === tk.id);
                    return rev ? { qualityScore: rev.qualityScore, fileCount: rev.fileCount, status: rev.status } : undefined;
                  })()}
                  showReviewActions={tk.status === "in_review"}
                  onApprove={handleApprove ? async (revId) => {
                    setActionLoading("approve");
                    try { await approveReview(revId); refreshTasks(); } catch {} finally { setActionLoading(null); }
                  } : undefined}
                  onReject={handleReject ? async (revId) => {
                    const reason = prompt("Grunn for avvisning:");
                    setActionLoading("reject");
                    try { await rejectReview(revId, reason || undefined); refreshTasks(); } catch {} finally { setActionLoading(null); }
                  } : undefined}
                  onRequestChanges={handleRequestChanges ? async (revId) => {
                    const feedback = prompt("Hva skal endres?");
                    if (!feedback) return;
                    setActionLoading("changes");
                    try { await requestReviewChanges(revId, feedback); refreshTasks(); } catch {} finally { setActionLoading(null); }
                  } : undefined}
                  onDelete={async (taskId) => {
                    try { await softDeleteTask(taskId); refreshTasks(); } catch {}
                  }}
                />
              ))
            )}
          </div>
        </GR>
      )}

      {/* Create task dialog */}
      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.15)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.r,
              padding: 24,
              width: 480,
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 20 }}>
              Ny oppgave
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Tittel</div>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Beskriv oppgaven..."
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Beskrivelse</div>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Valgfri beskrivelse..."
                style={textareaStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Repo</div>
              <div style={{ position: "relative" }}>
                <div
                  onClick={() => setRepoDropOpen((p) => !p)}
                  style={{
                    ...inputStyle,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 12,
                  }}
                >
                  <span>{newRepo || dynamicRepos[0] || "Velg repo"}</span>
                  <ChevronDown size={14} strokeWidth={1.5} style={{ color: T.textMuted }} />
                </div>
                {repoDropOpen && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setRepoDropOpen(false)} />
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      background: T.surface,
                      border: `1px solid ${T.border}`,
                      borderRadius: 12,
                      zIndex: 99,
                      overflow: "hidden",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    }}>
                      {dynamicRepos.map((r) => (
                        <div
                          key={r}
                          onClick={() => { setNewRepo(r); setRepoDropOpen(false); }}
                          style={{
                            padding: "10px 16px",
                            fontSize: 12,
                            fontFamily: T.mono,
                            color: (newRepo || dynamicRepos[0]) === r ? T.text : T.textMuted,
                            background: (newRepo || dynamicRepos[0]) === r ? T.subtle : "transparent",
                            cursor: "pointer",
                          }}
                        >
                          {r}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {availableSkills.map((sk) => {
                  const selected = newSkillIds.includes(sk.id);
                  return (
                    <div
                      key={sk.id}
                      onClick={() => setNewSkillIds(prev => selected ? prev.filter(id => id !== sk.id) : [...prev, sk.id])}
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        fontFamily: T.mono,
                        border: `1px solid ${selected ? T.accent : T.border}`,
                        borderRadius: 6,
                        color: selected ? T.accent : T.textSec,
                        background: selected ? T.accentDim : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      {sk.name}
                    </div>
                  );
                })}
                {availableSkills.length === 0 && (
                  <span style={{ fontSize: 11, color: T.textFaint }}>Ingen skills tilgjengelig</span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn sm onClick={() => setShowCreate(false)}>
                Avbryt
              </Btn>
              <Btn
                primary
                sm
                onClick={handleCreateTask}
                style={{ opacity: creating || !newTitle.trim() ? 0.5 : 1, pointerEvents: creating ? "none" : "auto" }}
              >
                {creating ? "Oppretter..." : "Opprett"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
