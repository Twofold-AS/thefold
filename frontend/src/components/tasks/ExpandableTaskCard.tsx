"use client";

import { useState, useEffect } from "react";
import { T, S } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import { ChevronDown, ChevronUp, FileText, Clock, Terminal, Trash2, DollarSign } from "lucide-react";
import { getTaskMetrics } from "@/lib/api/agent";

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

type TaskTab = "detaljer" | "rapporter" | "logg";

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
  const [costData, setCostData] = useState<{
    totalCostUsd: number;
    totalTokens: number;
    totalDurationMs: number;
    phases: Array<{ phase: string; tokensInput: number; tokensOutput: number; costUsd: number; model: string; aiCalls: number }>;
  } | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // Fetch real cost when expanded
  useEffect(() => {
    if (!expanded || costData !== null || costLoading) return;
    setCostLoading(true);
    getTaskMetrics(task.id)
      .then(res => setCostData(res.breakdown ?? null))
      .catch(() => {})
      .finally(() => setCostLoading(false));
  }, [expanded, task.id, costData, costLoading]);

  const statusInfo = STATUS_COLORS[task.status] ?? { color: T.textMuted, variant: "default" as const };

  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: T.r,
      overflow: "hidden",
    }}>
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
              { id: "logg" as TaskTab, label: "Logg", icon: <Clock size={12} /> },
            ]).map((tab, i, arr) => (
              <button
                key={tab.id}
                onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
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
                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6 }}>
                  {task.description || "Ingen beskrivelse tilgjengelig."}
                </div>
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

            {activeTab === "logg" && (
              <div style={{ fontSize: 12, fontFamily: T.mono, color: T.textMuted, lineHeight: 1.6 }}>
                <div>Opprettet: {task.createdAt ? new Date(task.createdAt).toLocaleString("nb-NO") : "—"}</div>
                {task.updatedAt && <div>Oppdatert: {new Date(task.updatedAt).toLocaleString("nb-NO")}</div>}
                <div>Status: {task.status}</div>
                {task.source && <div>Kilde: {task.source}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
