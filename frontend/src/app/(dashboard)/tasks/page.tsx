"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import { useApiData } from "@/lib/hooks";
import Skeleton from "@/components/Skeleton";
import { RefreshCw } from "lucide-react";
import {
  listTheFoldTasks,
  listReviews,
  syncLinearTasks,
  approveReview,
  requestReviewChanges,
  rejectReview,
  createTask,
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
  const [sel, setSel] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [creating, setCreating] = useState(false);

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
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
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
              Tasks
            </h2>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Oppgaver utfort av agenten med kvalitetsrapport.
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
            <Btn primary sm onClick={handleSync}>
              <RefreshCw size={14} style={{ marginRight: 4 }} />
              {syncing ? "Synkroniserer..." : "Importer fra Linear"}
            </Btn>
          </div>
        </div>
      </div>

      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: t ? "1fr 1fr" : "1fr",
            border: `1px solid ${T.border}`,
            minHeight: 400,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Task list */}
          <div style={{ borderRight: t ? `1px solid ${T.border}` : "none" }}>
            {tasksLoading ? (
              <div style={{ padding: "40px 20px" }}>
                <Skeleton rows={5} />
              </div>
            ) : tasks.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textFaint }}>Ingen oppgaver enna</span>
              </div>
            ) : (
              tasks.map((tk, i) => {
                const st = mapStatus(tk.status);
                const review = reviews.find((r) => r.taskId === tk.id);
                return (
                  <div
                    key={tk.id}
                    onClick={() => setSel(tk.id === sel ? null : tk.id)}
                    style={{
                      padding: "14px 20px",
                      cursor: "pointer",
                      background: sel === tk.id ? T.subtle : "transparent",
                      borderBottom: i < tasks.length - 1 ? `1px solid ${T.border}` : "none",
                      borderLeft: "none",
                      transition: "all 0.1s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                        {tk.id.substring(0, 8)}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1 }}>
                        {tk.title}
                      </span>
                      <Tag
                        variant={
                          st === "done"
                            ? "success"
                            : st === "active"
                              ? "accent"
                              : "default"
                        }
                      >
                        {statusLabel(tk.status)}
                      </Tag>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                        {tk.repo}
                      </span>
                      {tk.source === "linear" && (
                        <span style={{ fontSize: 10, fontFamily: T.mono, color: "#A5B4FC" }}>
                          linear
                        </span>
                      )}
                      {review && review.qualityScore !== null && (
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: T.mono,
                            color:
                              review.qualityScore >= 8
                                ? T.success
                                : review.qualityScore >= 6
                                  ? T.warning
                                  : T.error,
                          }}
                        >
                          kvalitet: {review.qualityScore}/10
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>
                        {timeAgo(tk.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Detail panel */}
          {t && (
            <div style={{ padding: 24, overflow: "auto" }}>
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: T.text,
                    marginBottom: 4,
                  }}
                >
                  {t.title}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <Tag variant={tStatus === "done" ? "success" : "accent"}>{statusLabel(t.status)}</Tag>
                  <Tag>{t.repo}</Tag>
                  {t.source === "linear" && <Tag variant="info">linear</Tag>}
                  {t.source === "manual" && <Tag>manuell</Tag>}
                  {t.source === "chat" && <Tag variant="brand">chat</Tag>}
                </div>
                {t.description && (
                  <p style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5, marginBottom: 12 }}>
                    {t.description}
                  </p>
                )}
              </div>

              {tReview && tReview.qualityScore !== null ? (
                <>
                  <SectionLabel>KVALITETSRAPPORT</SectionLabel>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 1,
                      marginBottom: 20,
                    }}
                  >
                    {[
                      {
                        l: "KVALITET",
                        v: `${tReview.qualityScore}/10`,
                        c:
                          tReview.qualityScore >= 8
                            ? T.success
                            : tReview.qualityScore >= 6
                              ? T.warning
                              : T.error,
                      },
                      { l: "FILER", v: `${tReview.fileCount}` },
                      { l: "STATUS", v: tReview.status },
                    ].map((m, i) => (
                      <div
                        key={i}
                        style={{
                          background: T.subtle,
                          padding: "12px 16px",
                          borderRadius: 6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: T.textMuted,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginBottom: 4,
                          }}
                        >
                          {m.l}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: m.c || T.text }}>
                          {m.v}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <div
                      style={{
                        height: 8,
                        background: T.subtle,
                        borderRadius: 4,
                        overflow: "hidden",
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          width: `${tReview.qualityScore * 10}%`,
                          height: "100%",
                          background:
                            tReview.qualityScore >= 8
                              ? T.success
                              : tReview.qualityScore >= 6
                                ? T.warning
                                : T.error,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                      Score: {tReview.qualityScore * 10}%
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <SectionLabel>KVALITETSRAPPORT</SectionLabel>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 1,
                      marginBottom: 20,
                    }}
                  >
                    {[
                      { l: "KVALITET", v: "—" },
                      { l: "FILER", v: "—" },
                      { l: "STATUS", v: "—" },
                    ].map((m, i) => (
                      <div
                        key={i}
                        style={{
                          background: T.subtle,
                          padding: "12px 16px",
                          borderRadius: 6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: T.textMuted,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginBottom: 4,
                          }}
                        >
                          {m.l}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.textFaint }}>
                          {m.v}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <SectionLabel>LABELS</SectionLabel>
              <div style={{ marginBottom: 20 }}>
                {t.labels && t.labels.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {t.labels.map((label, i) => (
                      <Tag key={i}>{label}</Tag>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: T.textFaint }}>Ingen labels</div>
                )}
              </div>

              {t.errorMessage && (
                <>
                  <SectionLabel>FEILMELDING</SectionLabel>
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: T.mono,
                      color: T.error,
                      marginBottom: 20,
                      lineHeight: 1.5,
                    }}
                  >
                    {t.errorMessage}
                  </div>
                </>
              )}

              {t.prUrl && (
                <>
                  <SectionLabel>PR</SectionLabel>
                  <div style={{ marginBottom: 20 }}>
                    <a
                      href={t.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, fontFamily: T.mono, color: T.accent }}
                    >
                      {t.prUrl}
                    </a>
                  </div>
                </>
              )}

              {t.status === "in_review" && tReview && tReview.status === "pending" && (
                <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
                  <Btn primary sm onClick={handleApprove}>
                    {actionLoading === "approve" ? "..." : "Godkjenn"}
                  </Btn>
                  <Btn sm onClick={handleRequestChanges}>
                    {actionLoading === "changes" ? "..." : "Be om endringer"}
                  </Btn>
                  <Btn sm onClick={handleReject} style={{ color: T.error, borderColor: "rgba(99,102,241,0.3)" }}>
                    {actionLoading === "reject" ? "..." : "Avvis"}
                  </Btn>
                </div>
              )}
            </div>
          )}
        </div>
      </GR>
      <GR mb={40}>
        <div style={{ height: 1 }} />
      </GR>

      {/* Create task dialog */}
      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
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
              <select
                value={newRepo || dynamicRepos[0] || ""}
                onChange={(e) => setNewRepo(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  appearance: "auto",
                }}
              >
                {dynamicRepos.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
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
