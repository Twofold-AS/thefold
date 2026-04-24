"use client";

import { useState, useEffect, useRef } from "react";
import { T, S } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import ShimmerOverlay from "@/components/ShimmerOverlay";
import { ChevronDown, ChevronUp, FileText, Clock, Terminal, Trash2, GitBranch, CheckSquare } from "lucide-react";
import { getTaskMetrics } from "@/lib/api/agent";
import { listSubTasks } from "@/lib/api";

export interface TaskData {
  id: string;
  title: string;
  description?: string;
  status: string;
  source?: string;
  repo?: string;
  complexity?: number;
  estimatedTokens?: number;
  createdAt?: string;
  updatedAt?: string;
  reviewId?: string;
  prUrl?: string | null;
  errorMessage?: string | null;
}

type TaskTab = "detaljer" | "rapporter" | "review" | "logg" | "deloppgaver";

export interface ReviewData {
  qualityScore: number | null;
  fileCount: number;
  status: string;
  concerns?: string[];
  documentation?: string;
}

interface ExpandableTaskCardProps {
  task: TaskData;
  review?: ReviewData;
  onApprove?: (reviewId: string) => void;
  onReject?: (reviewId: string) => void;
  onRequestChanges?: (reviewId: string) => void;
  onDelete?: (taskId: string) => void;
  /** Show review action buttons */
  showReviewActions?: boolean;
}

function cleanDescription(raw: string): string {
  return raw
    .replace(/^-{2,}\s*$/gm, "")        // remove --- and -- dividers
    .replace(/\*\*(.+?)\*\*/g, "$1")    // strip **bold**
    .replace(/\*(.+?)\*/g, "$1")         // strip *italic*
    .replace(/\n{3,}/g, "\n\n")          // collapse triple+ newlines
    .trim();
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  return `${Math.floor(h / 24)}d`;
}

const STATUS_COLORS: Record<string, { color: string; variant: "accent" | "error" | "default" }> = {
  done: { color: T.success, variant: "accent" },
  in_progress: { color: T.accent, variant: "accent" },
  in_review: { color: T.warning, variant: "default" },
  backlog: { color: T.textMuted, variant: "default" },
  planned: { color: T.infoA10, variant: "default" },
  blocked: { color: T.error, variant: "error" },
  failed: { color: T.error, variant: "error" },
};

export default function ExpandableTaskCard({
  task,
  review,
  onApprove,
  onReject,
  onRequestChanges,
  onDelete,
  showReviewActions,
}: ExpandableTaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskTab>("detaljer");
  const [descExpanded, setDescExpanded] = useState(false);
  const [subTasks, setSubTasks] = useState<any[] | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [costData, setCostData] = useState<{
    totalCostUsd: number;
    totalTokens: number;
    totalDurationMs: number;
    phases: Array<{ phase: string; tokensInput: number; tokensOutput: number; costUsd: number; model: string; aiCalls: number }>;
  } | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const costFetchedRef = useRef(false);

  // Fetch cost once when first expanded — ref prevents re-runs on state change
  useEffect(() => {
    if (!expanded || costFetchedRef.current) return;
    costFetchedRef.current = true;
    setCostLoading(true);
    getTaskMetrics(task.id)
      .then(res => setCostData(res.breakdown ?? null))
      .catch(() => {})
      .finally(() => setCostLoading(false));
  }, [expanded, task.id]);

  const statusInfo = STATUS_COLORS[task.status] ?? { color: T.textMuted, variant: "default" as const };
  // Shimmer fires while the task is blocked on an external signal the user
  // controls: a pending review waiting for approval, or an in_progress task
  // that is genuinely running server-side. When the review is resolved or
  // task moves to done/failed, the shimmer goes away on its own.
  const isWaiting = task.status === "in_review" || task.status === "pending_review";

  return (
    <ShimmerOverlay
      active={isWaiting}
      radius={T.r}
      style={{
        background: T.sidebar,
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
      }}
    >
      {/* Header — always visible */}
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
          <div style={{
            fontSize: 14, fontWeight: 500, color: T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {task.title}
          </div>
          <div style={{ display: "flex", gap: S.sm, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
            {task.repo && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{task.repo}</span>
            )}
            {task.source && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{task.source}</span>
            )}
            {task.complexity != null && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                kompleksitet: {task.complexity}
              </span>
            )}
          </div>
        </div>

        <Tag variant={statusInfo.variant}>{task.status}</Tag>

        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
          {task.createdAt ? timeAgo(task.createdAt) : ""}
        </span>

        {expanded
          ? <ChevronUp size={16} color={T.textMuted} />
          : <ChevronDown size={16} color={T.textMuted} />
        }
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {/* Horizontal tab menu — square borders */}
          <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
            {([
              { id: "detaljer" as TaskTab, label: "Detaljer", icon: <FileText size={12} /> },
              { id: "rapporter" as TaskTab, label: "Rapporter", icon: <Terminal size={12} /> },
              { id: "review" as TaskTab, label: "Review", icon: <CheckSquare size={12} /> },
              { id: "logg" as TaskTab, label: "Logg", icon: <Clock size={12} /> },
              { id: "deloppgaver" as TaskTab, label: "Deloppgaver", icon: <GitBranch size={12} /> },
            ]).map((tab, i, arr) => (
              <button
                key={tab.id}
                onClick={async (e) => {
                  e.stopPropagation();
                  setActiveTab(tab.id);
                  if (tab.id === "deloppgaver" && subTasks === null && !subLoading) {
                    setSubLoading(true);
                    try {
                      const r = await listSubTasks(task.id);
                      setSubTasks(r.tasks ?? []);
                    } catch {
                      setSubTasks([]);
                    } finally {
                      setSubLoading(false);
                    }
                  }
                }}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  fontSize: 12,
                  fontFamily: T.mono,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: activeTab === tab.id ? T.subtle : "transparent",
                  color: activeTab === tab.id ? T.text : T.textMuted,
                  border: "none",
                  borderRight: i < arr.length - 1 ? `1px solid ${T.border}` : "none",
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
                {task.description ? (() => {
                  const cleaned = cleanDescription(task.description);
                  const lines = cleaned.split("\n");
                  const isLong = lines.length > 3;
                  const preview = isLong && !descExpanded ? lines.slice(0, 3).join("\n") : cleaned;
                  return (
                    <div>
                      <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {preview}
                      </div>
                      {isLong && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDescExpanded(p => !p); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: T.accent, fontSize: 12, padding: "4px 0 0", fontFamily: T.sans }}
                        >
                          {descExpanded ? "Vis mindre ↑" : "Vis mer ↓"}
                        </button>
                      )}
                    </div>
                  );
                })() : (
                  <div style={{ fontSize: 13, color: T.textFaint }}>Ingen beskrivelse tilgjengelig.</div>
                )}
                <div style={{ display: "flex", gap: S.lg, marginTop: S.sm, fontSize: 11, fontFamily: T.mono, color: T.textFaint, flexWrap: "wrap" }}>
                  <span>ID: {task.id.slice(0, 8)}</span>
                  {task.source && <span>Kilde: {task.source}</span>}
                  {costData && (
                    <>
                      <span style={{ color: T.accent }}>${costData.totalCostUsd.toFixed(4)}</span>
                      <span>{costData.totalTokens.toLocaleString()} tokens</span>
                      <span>{(costData.totalDurationMs / 1000).toFixed(1)}s</span>
                    </>
                  )}
                  {!costData && costLoading && <span>Henter kostnad...</span>}
                </div>

                {/* PR link */}
                {task.prUrl && (
                  <a
                    href={task.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontSize: 12, fontFamily: T.mono, color: T.accent,
                      padding: "8px 12px",
                      border: `1px solid ${T.accent}`,
                      borderRadius: 0,
                      textDecoration: "none",
                      marginTop: S.sm,
                    }}
                  >
                    Se PR på GitHub →
                  </a>
                )}

                {/* Error message */}
                {task.errorMessage && (
                  <div style={{
                    padding: "8px 12px",
                    border: `1px solid ${T.dangerA10}`,
                    borderRadius: 0,
                    fontSize: 12, fontFamily: T.mono, color: T.error,
                    lineHeight: 1.5, marginTop: S.sm,
                  }}>
                    {task.errorMessage}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: S.sm, marginTop: S.md }}>
                  {showReviewActions && task.reviewId && (
                    <>
                      {onApprove && <Btn variant="primary" size="sm" onClick={() => onApprove(task.reviewId!)}>Godkjenn</Btn>}
                      {onRequestChanges && <Btn size="sm" onClick={() => onRequestChanges(task.reviewId!)}>Be om endringer</Btn>}
                      {onReject && <Btn size="sm" style={{ color: T.error }} onClick={() => onReject(task.reviewId!)}>Avvis</Btn>}
                    </>
                  )}
                  {onDelete && (
                    <Btn size="sm" style={{ color: T.error, marginLeft: "auto" }} onClick={() => onDelete(task.id)}>
                      <Trash2 size={12} /> Slett
                    </Btn>
                  )}
                </div>
              </div>
            )}

            {activeTab === "rapporter" && (
              <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
                {review ? (
                  <>
                    {/* Quality + stats */}
                    <div style={{ display: "flex", gap: S.lg, alignItems: "center", flexWrap: "wrap" }}>
                      {review.qualityScore != null && (
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Kvalitet</div>
                          <div style={{
                            fontSize: 28, fontWeight: 700,
                            color: review.qualityScore >= 8 ? T.success : review.qualityScore >= 6 ? T.warning : T.error,
                          }}>
                            {review.qualityScore}/10
                          </div>
                          <div style={{
                            height: 4, width: 80, borderRadius: 2, marginTop: 4,
                            background: T.subtle, overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${(review.qualityScore ?? 0) * 10}%`, height: "100%",
                              background: review.qualityScore >= 8 ? T.success : review.qualityScore >= 6 ? T.warning : T.error,
                            }} />
                          </div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Filer</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.text }}>{review.fileCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Status</div>
                        <Tag variant={review.status === "approved" ? "accent" : review.status === "rejected" ? "error" : "default"}>{review.status}</Tag>
                      </div>
                    </div>

                    {/* Concerns */}
                    {review.concerns && review.concerns.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Bekymringer</div>
                        {review.concerns.map((c, i) => (
                          <div key={i} style={{
                            fontSize: 12, color: T.textSec, lineHeight: 1.5,
                            paddingLeft: 10, borderLeft: `2px solid ${T.warning}`, marginBottom: 4,
                          }}>{c}</div>
                        ))}
                      </div>
                    )}

                    {/* Documentation */}
                    {review.documentation && (
                      <div>
                        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Dokumentasjon</div>
                        <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {review.documentation}
                        </div>
                      </div>
                    )}

                    {/* Review actions in Rapporter tab too */}
                    {showReviewActions && task.reviewId && (
                      <div style={{ display: "flex", gap: S.sm, borderTop: `1px solid ${T.border}`, paddingTop: S.md }}>
                        {onApprove && <Btn variant="primary" size="sm" onClick={() => onApprove(task.reviewId!)}>Godkjenn</Btn>}
                        {onRequestChanges && <Btn size="sm" onClick={() => onRequestChanges(task.reviewId!)}>Be om endringer</Btn>}
                        {onReject && <Btn size="sm" style={{ color: T.error }} onClick={() => onReject(task.reviewId!)}>Avvis</Btn>}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: T.textMuted }}>
                    Ingen review-rapport tilgjengelig ennå.
                  </div>
                )}

                {/* Real cost breakdown */}
                {costData && (
                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: S.md }}>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S.sm }}>
                      Reelt forbruk
                    </div>
                    <div style={{ display: "flex", gap: S.lg, flexWrap: "wrap", marginBottom: S.md }}>
                      <div>
                        <div style={{ fontSize: 10, color: T.textFaint }}>Kostnad</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.accent }}>${costData.totalCostUsd.toFixed(4)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.textFaint }}>Tokens totalt</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.text }}>{costData.totalTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.textFaint }}>Varighet</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.text }}>{(costData.totalDurationMs / 1000).toFixed(1)}s</div>
                      </div>
                    </div>

                    {/* Per-phase breakdown */}
                    {costData.phases.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {costData.phases.map((p, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "6px 10px",
                            border: `1px solid ${T.border}`,
                            borderRadius: 0,
                            fontSize: 11, fontFamily: T.mono,
                          }}>
                            <span style={{ color: T.text, fontWeight: 500 }}>{p.phase}</span>
                            <div style={{ display: "flex", gap: S.md, color: T.textMuted }}>
                              <span>{p.model}</span>
                              <span>{(p.tokensInput + p.tokensOutput).toLocaleString()} tok</span>
                              <span style={{ color: T.accent }}>${p.costUsd.toFixed(4)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!costData && costLoading && (
                  <div style={{ fontSize: 12, color: T.textFaint, marginTop: S.md }}>Henter kostnadsdata...</div>
                )}
              </div>
            )}

            {activeTab === "review" && (
              <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
                {review ? (
                  <ShimmerOverlay
                    active={review.status === "pending"}
                    radius={T.r}
                    style={{
                      border: `1px solid ${T.border}`,
                      borderRadius: T.r,
                    }}
                  >
                    <div style={{ padding: S.lg, display: "flex", flexDirection: "column", gap: S.md }}>
                      {/* Summary row: score + files + status */}
                      <div style={{ display: "flex", gap: S.lg, alignItems: "center", flexWrap: "wrap" }}>
                        {review.qualityScore != null && (
                          <div>
                            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Kvalitet</div>
                            <div style={{
                              fontSize: 28, fontWeight: 700,
                              color: review.qualityScore >= 8 ? T.success : review.qualityScore >= 6 ? T.warning : T.error,
                            }}>
                              {review.qualityScore}/10
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Filer</div>
                          <div style={{ fontSize: 20, fontWeight: 600, color: T.text }}>{review.fileCount}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Status</div>
                          <Tag variant={review.status === "approved" ? "accent" : review.status === "rejected" ? "error" : "default"}>{review.status}</Tag>
                        </div>
                      </div>

                      {review.concerns && review.concerns.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Bekymringer</div>
                          {review.concerns.map((c, i) => (
                            <div key={i} style={{
                              fontSize: 12, color: T.textSec, lineHeight: 1.5,
                              paddingLeft: 10, borderLeft: `2px solid ${T.warning}`, marginBottom: 4,
                            }}>{c}</div>
                          ))}
                        </div>
                      )}

                      {review.documentation && (
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Dokumentasjon</div>
                          <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {review.documentation}
                          </div>
                        </div>
                      )}

                      {showReviewActions && task.reviewId && (
                        <div style={{ display: "flex", gap: S.sm, borderTop: `1px solid ${T.border}`, paddingTop: S.md }}>
                          {onApprove && <Btn variant="primary" size="sm" onClick={() => onApprove(task.reviewId!)}>Godkjenn</Btn>}
                          {onRequestChanges && <Btn size="sm" onClick={() => onRequestChanges(task.reviewId!)}>Be om endringer</Btn>}
                          {onReject && <Btn size="sm" style={{ color: T.error }} onClick={() => onReject(task.reviewId!)}>Avvis</Btn>}
                        </div>
                      )}
                    </div>
                  </ShimmerOverlay>
                ) : (
                  <div style={{
                    padding: `${S.lg}px ${S.md}px`,
                    textAlign: "center",
                    fontSize: 13,
                    color: T.textFaint,
                    border: `1px dashed ${T.border}`,
                    borderRadius: T.r,
                  }}>
                    Ingen reviews enda
                  </div>
                )}
              </div>
            )}

            {activeTab === "logg" && (
              <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
                {/* Timeline info */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.accent, flexShrink: 0 }}>schedule</span>
                    <div>
                      <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Opprettet</div>
                      <div style={{ fontSize: 12, color: T.text, fontFamily: T.mono }}>
                        {task.createdAt ? new Date(task.createdAt).toLocaleString("nb-NO") : "—"}
                      </div>
                    </div>
                  </div>
                  {task.updatedAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.warning, flexShrink: 0 }}>update</span>
                      <div>
                        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Oppdatert</div>
                        <div style={{ fontSize: 12, color: T.text, fontFamily: T.mono }}>
                          {new Date(task.updatedAt).toLocaleString("nb-NO")}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status and source */}
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: S.md, display: "flex", flexDirection: "column", gap: S.sm }}>
                  <div>
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Status</div>
                    <div style={{ fontSize: 12, color: T.text }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        background: `${statusInfo.color}20`,
                        color: statusInfo.color,
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        fontFamily: T.sans,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusInfo.color }} />
                        {task.status}
                      </span>
                    </div>
                  </div>
                  {task.source && (
                    <div>
                      <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Kilde</div>
                      <div style={{ fontSize: 12, color: T.text, fontFamily: T.mono }}>{task.source}</div>
                    </div>
                  )}
                </div>

                {/* File changes (if available via task metadata) */}
                {/* Note: Full build-log integration would require additional API endpoint */}
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: S.md, fontSize: 11, color: T.textFaint }}>
                  Detaljert build-logg er tilgjengelig via Review-fanen når oppgaven er fullført.
                </div>
              </div>
            )}

            {activeTab === "deloppgaver" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {subLoading ? (
                  <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 0" }}>Laster deloppgaver...</div>
                ) : (subTasks ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: T.textFaint, padding: "8px 0" }}>Ingen deloppgaver</div>
                ) : (
                  (subTasks ?? []).map((sub: any, i: number) => {
                    const isLast = i === (subTasks ?? []).length - 1;
                    const subColor = sub.status === "done" || sub.status === "completed"
                      ? (T.success ?? "#22c55e")
                      : sub.status === "in_progress" ? T.accent
                      : sub.status === "blocked" ? (T.error ?? "#f87171")
                      : T.textFaint;
                    return (
                      <div key={sub.id} style={{ display: "flex", alignItems: "flex-start" }}>
                        <div style={{ width: 20, minWidth: 20, alignSelf: "stretch", position: "relative", marginRight: 8 }}>
                          <div style={{ position: "absolute", top: 0, bottom: isLast ? "50%" : 0, left: 8, borderLeft: `2px solid ${T.border}` }} />
                          <div style={{ position: "absolute", top: "50%", left: 8, width: 12, borderBottom: `2px solid ${T.border}` }} />
                        </div>
                        <div style={{
                          flex: 1, display: "flex", alignItems: "center", gap: 8,
                          padding: "7px 12px", background: T.subtle,
                          border: `1px solid ${T.border}`, borderRadius: T.r,
                          fontSize: 12, marginBottom: 4,
                        }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: subColor, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: T.text }}>{sub.title}</span>
                          <span style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 4,
                            background: `${subColor}20`, color: subColor, fontFamily: T.mono,
                          }}>
                            {sub.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </ShimmerOverlay>
  );
}
