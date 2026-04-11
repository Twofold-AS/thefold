"use client";

import { use, useState } from "react";
import Link from "next/link";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import {
  getReview,
  approveReview,
  rejectReview,
  requestReviewChanges,
  type ReviewFile,
  type AIReviewData,
} from "@/lib/api";
import { ChevronLeft, ExternalLink, Check, X, FileCode, AlertTriangle, Lightbulb } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string): "success" | "accent" | "error" | "default" | "warning" {
  if (status === "approved") return "success";
  if (status === "pending") return "accent";
  if (status === "rejected") return "error";
  if (status === "changes_requested") return "warning";
  return "default";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Venter på godkjenning",
    approved: "Godkjent",
    rejected: "Avvist",
    changes_requested: "Endringer forespurt",
  };
  return map[status] ?? status;
}

function actionLabel(action: string): string {
  return action === "create" ? "+" : action === "delete" ? "−" : "~";
}

function actionColor(action: string): string {
  return action === "create" ? T.success : action === "delete" ? T.error : T.warning;
}

function actionBg(action: string): string {
  return action === "create"
    ? "rgba(34,197,94,0.1)"
    : action === "delete"
    ? "rgba(239,68,68,0.1)"
    : "rgba(234,179,8,0.1)";
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("nb-NO", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function scoreColor(score: number): string {
  if (score >= 8) return T.success;
  if (score >= 6) return T.warning;
  return T.error;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, loading, refresh } = useApiData(() => getReview(id), [id]);
  const review = data?.review;

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<"approve" | "reject" | "changes" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleFile = (path: string) =>
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });

  const handleApprove = async () => {
    setAction("approve");
    setActionError(null);
    try {
      await approveReview(id);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Godkjenning feilet");
    } finally {
      setAction(null);
    }
  };

  const handleReject = async () => {
    setAction("reject");
    setActionError(null);
    try {
      await rejectReview(id);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Avvisning feilet");
    } finally {
      setAction(null);
    }
  };

  const handleRequestChanges = async () => {
    if (!feedback.trim()) {
      setShowFeedback(true);
      return;
    }
    setAction("changes");
    setActionError(null);
    try {
      await requestReviewChanges(id, feedback.trim());
      setFeedback("");
      setShowFeedback(false);
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Forespørsel feilet");
    } finally {
      setAction(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "32px 0" }}>
        <Skeleton style={{ height: 160, borderRadius: T.r, marginBottom: 20 }} />
        <Skeleton style={{ height: 300, borderRadius: T.r }} />
      </div>
    );
  }

  if (!review) {
    return (
      <div style={{ paddingTop: 60, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: T.textFaint }}>Review ikke funnet.</div>
        <div style={{ marginTop: 16 }}>
          <Link href="/tasks" style={{ fontSize: 12, color: T.accent, textDecoration: "none" }}>
            ← Tilbake til Tasks
          </Link>
        </div>
      </div>
    );
  }

  const isPending = review.status === "pending";
  const aiReview: AIReviewData | undefined = review.aiReview;
  const files: ReviewFile[] = review.filesChanged ?? [];

  return (
    <>
      <div style={{ paddingTop: 32, paddingBottom: 20 }}>
        {/* Breadcrumb */}
        <Link href="/tasks" style={{ textDecoration: "none" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, color: T.textMuted, marginBottom: 20, cursor: "pointer",
          }}>
            <ChevronLeft size={14} />
            Tilbake til Tasks
          </div>
        </Link>

        {/* Header card */}
        <div style={{
          border: `1px solid ${T.border}`, borderRadius: T.r,
          padding: "20px 24px", marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0 }}>
                Code Review
              </h1>
              <Tag variant={statusVariant(review.status)}>{statusLabel(review.status)}</Tag>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <MetaItem label="Review ID" value={review.id.substring(0, 12) + "…"} mono />
              <MetaItem label="Task" value={review.taskId.substring(0, 12) + "…"} mono />
              {review.repoName && <MetaItem label="Repo" value={review.repoName} mono />}
              <MetaItem label="Opprettet" value={formatDate(review.createdAt)} />
              {review.reviewedAt && (
                <MetaItem label="Gjennomgått" value={formatDate(review.reviewedAt)} />
              )}
            </div>
            {review.feedback && (
              <div style={{
                marginTop: 12, padding: "8px 12px",
                background: "rgba(234,179,8,0.08)", border: `1px solid rgba(234,179,8,0.2)`,
                borderRadius: 6, fontSize: 12, color: T.textSec, lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 600, color: T.warning }}>Tilbakemelding: </span>
                {review.feedback}
              </div>
            )}
          </div>

          {/* Quality score */}
          {aiReview?.qualityScore != null && (
            <div style={{
              textAlign: "center", flexShrink: 0,
              padding: "12px 20px", background: T.subtle,
              border: `1px solid ${T.border}`, borderRadius: T.r,
            }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor(aiReview.qualityScore), fontFamily: T.mono, lineHeight: 1 }}>
                {aiReview.qualityScore}
              </div>
              <div style={{ fontSize: 10, color: T.textFaint, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                / 10
              </div>
              <div style={{
                width: 80, height: 4, background: T.border,
                borderRadius: 2, marginTop: 8, overflow: "hidden",
              }}>
                <div style={{
                  width: `${aiReview.qualityScore * 10}%`, height: "100%",
                  background: scoreColor(aiReview.qualityScore), borderRadius: 2,
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ fontSize: 10, color: T.textFaint, marginTop: 4 }}>kvalitetsscore</div>
            </div>
          )}
        </div>
      </div>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
          {/* Left: Files */}
          <div>
            <SectionLabel>ENDREDE FILER ({files.length})</SectionLabel>

            {files.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "32px 20px",
                border: `1px dashed ${T.border}`, borderRadius: T.r,
                fontSize: 12, color: T.textFaint,
              }}>
                Ingen filer registrert for denne reviewen.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {files.map((f) => (
                  <FileEntry
                    key={f.path}
                    file={f}
                    expanded={expandedFiles.has(f.path)}
                    onToggle={() => toggleFile(f.path)}
                  />
                ))}
              </div>
            )}

            {/* PR link */}
            {review.prUrl && (
              <div style={{ marginTop: 16 }}>
                <SectionLabel>PULL REQUEST</SectionLabel>
                <a
                  href={review.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 13, color: T.accent, textDecoration: "none", fontFamily: T.mono,
                  }}
                >
                  {review.prUrl} <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>

          {/* Right: AI Review + Actions */}
          <div>
            {/* Action buttons */}
            {isPending && (
              <div style={{ marginBottom: 20 }}>
                <SectionLabel>HANDLING</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Btn
                    primary sm
                    onClick={handleApprove}
                    style={{ opacity: action !== null ? 0.5 : 1, pointerEvents: action !== null ? "none" : "auto" }}
                  >
                    {action === "approve" ? "Godkjenner..." : (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Check size={13} /> Godkjenn og lag PR
                      </span>
                    )}
                  </Btn>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn
                      sm
                      onClick={() => setShowFeedback((p) => !p)}
                      style={{ flex: 1, opacity: action !== null ? 0.5 : 1, pointerEvents: action !== null ? "none" : "auto" }}
                    >
                      Be om endringer
                    </Btn>
                    <Btn
                      sm
                      onClick={handleReject}
                      style={{ color: T.error, opacity: action !== null ? 0.5 : 1, pointerEvents: action !== null ? "none" : "auto" }}
                    >
                      {action === "reject" ? "..." : <X size={13} />}
                    </Btn>
                  </div>
                  {showFeedback && (
                    <div>
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Beskriv hva som bør endres..."
                        style={{
                          width: "100%", minHeight: 80, resize: "vertical",
                          background: T.subtle, border: `1px solid ${T.border}`,
                          borderRadius: 6, padding: "8px 12px",
                          fontSize: 12, color: T.text, fontFamily: T.sans,
                          outline: "none", boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                        <Btn sm onClick={() => { setShowFeedback(false); setFeedback(""); }}>Avbryt</Btn>
                        <Btn
                          primary sm
                          onClick={handleRequestChanges}
                          style={{ opacity: action !== null || !feedback.trim() ? 0.5 : 1, pointerEvents: action !== null ? "none" : "auto" }}
                        >
                          {action === "changes" ? "Sender..." : "Send tilbakemelding"}
                        </Btn>
                      </div>
                    </div>
                  )}
                  {actionError && (
                    <div style={{ fontSize: 11, color: T.error, padding: "6px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
                      {actionError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Review */}
            {aiReview && (
              <>
                {aiReview.documentation && (
                  <div style={{ marginBottom: 16 }}>
                    <SectionLabel>AI-VURDERING</SectionLabel>
                    <div style={{
                      fontSize: 12, color: T.textSec, lineHeight: 1.6,
                      background: T.subtle, border: `1px solid ${T.border}`,
                      borderRadius: 6, padding: "12px 14px",
                      maxHeight: 200, overflowY: "auto",
                    }}>
                      {aiReview.documentation}
                    </div>
                  </div>
                )}

                {aiReview.concerns && aiReview.concerns.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <SectionLabel>BEKYMRINGER</SectionLabel>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {aiReview.concerns.map((concern, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex", gap: 8, padding: "8px 10px",
                            background: "rgba(234,179,8,0.06)",
                            border: `1px solid rgba(234,179,8,0.15)`,
                            borderRadius: 6,
                          }}
                        >
                          <AlertTriangle size={13} style={{ color: T.warning, flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>{concern}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiReview.memoriesExtracted && aiReview.memoriesExtracted.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <SectionLabel>EKSTRAHERTE MINNER</SectionLabel>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {aiReview.memoriesExtracted.map((mem, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex", gap: 8, padding: "6px 10px",
                            background: T.subtle, border: `1px solid ${T.border}`,
                            borderRadius: 6,
                          }}
                        >
                          <Lightbulb size={12} style={{ color: T.accent, flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 11, color: T.textFaint, lineHeight: 1.5 }}>{mem}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Quick stats */}
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>SAMMENDRAG</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Filer", value: files.length },
                  { label: "Opprettet", value: files.filter((f) => f.action === "create").length },
                  { label: "Endret", value: files.filter((f) => f.action === "modify").length },
                  { label: "Slettet", value: files.filter((f) => f.action === "delete").length },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      background: T.subtle, border: `1px solid ${T.border}`,
                      borderRadius: 6, padding: "10px 14px",
                    }}
                  >
                    <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: T.mono }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Link
                href={`/tasks`}
                style={{ fontSize: 12, color: T.textMuted, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
              >
                <ChevronLeft size={12} /> Alle tasks
              </Link>
              {review.taskId && (
                <Link
                  href={`/chat?task=${review.taskId}`}
                  style={{ fontSize: 12, color: T.accent, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <FileCode size={12} /> Åpne i Chat
                </Link>
              )}
            </div>
          </div>
        </div>
      </GR>

      <GR mb={40}>
        <div style={{ height: 1 }} />
      </GR>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: T.textSec, fontFamily: mono ? T.mono : T.sans }}>
        {value}
      </div>
    </div>
  );
}

function FileEntry({
  file,
  expanded,
  onToggle,
}: {
  file: ReviewFile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  const hasContent = Boolean(file.content);

  return (
    <div>
      <div
        onClick={hasContent ? onToggle : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px",
          background: T.subtle, border: `1px solid ${T.border}`,
          borderRadius: expanded ? "6px 6px 0 0" : 6,
          cursor: hasContent ? "pointer" : "default",
          userSelect: "none",
          transition: "background 0.1s",
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, flexShrink: 0,
          color: actionColor(file.action),
          background: actionBg(file.action),
        }}>
          {actionLabel(file.action)}
        </span>
        <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file.path}
        </span>
        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, flexShrink: 0 }}>
          {ext}
        </span>
        {hasContent && (
          <span style={{ fontSize: 10, color: T.textFaint, flexShrink: 0 }}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>
      {expanded && hasContent && (
        <pre style={{
          margin: 0, padding: "12px 14px",
          background: "rgba(0,0,0,0.35)",
          border: `1px solid ${T.border}`, borderTop: "none",
          borderRadius: "0 0 6px 6px",
          fontSize: 11, fontFamily: T.mono, color: T.textSec,
          lineHeight: 1.55, overflowX: "auto",
          maxHeight: 400, overflowY: "auto",
          whiteSpace: "pre", wordBreak: "normal",
          tabSize: 2,
        }}>
          {file.content}
        </pre>
      )}
    </div>
  );
}
