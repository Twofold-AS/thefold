"use client";

import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import SectionLabel from "@/components/SectionLabel";
import { mapStatus, statusLabel } from "./taskUtils";
import type { TheFoldTask, ReviewSummary } from "@/lib/api";

interface TaskDetailPanelProps {
  task: TheFoldTask;
  review?: ReviewSummary;
  actionLoading: string | null;
  onApprove: () => void;
  onRequestChanges: () => void;
  onReject: () => void;
}

function QualityMetrics({ review }: { review: ReviewSummary }) {
  const metrics = review.qualityScore !== null
    ? [
        { l: "KVALITET", v: `${review.qualityScore}/10`, c: review.qualityScore >= 8 ? T.success : review.qualityScore >= 6 ? T.warning : T.error },
        { l: "FILER", v: `${review.fileCount}` },
        { l: "STATUS", v: review.status },
      ]
    : [
        { l: "KVALITET", v: "—" },
        { l: "FILER", v: "—" },
        { l: "STATUS", v: "—" },
      ];

  return (
    <>
      <SectionLabel>KVALITETSRAPPORT</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, marginBottom: 20 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ background: T.subtle, padding: "12px 16px", borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              {m.l}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: (m as any).c || (review.qualityScore === null ? T.textFaint : T.text) }}>
              {m.v}
            </div>
          </div>
        ))}
      </div>
      {review.qualityScore !== null && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 8, background: T.subtle, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
            <div style={{
              width: `${review.qualityScore * 10}%`,
              height: "100%",
              background: review.qualityScore >= 8 ? T.success : review.qualityScore >= 6 ? T.warning : T.error,
            }} />
          </div>
          <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
            Score: {review.qualityScore * 10}%
          </div>
        </div>
      )}
    </>
  );
}

export default function TaskDetailPanel({ task, review, actionLoading, onApprove, onRequestChanges, onReject }: TaskDetailPanelProps) {
  const tStatus = mapStatus(task.status);

  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: T.text, marginBottom: 4 }}>
          {task.title}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Tag variant={tStatus === "done" ? "success" : "accent"}>{statusLabel(task.status)}</Tag>
          <Tag>{task.repo}</Tag>
          {task.source === "linear" && <Tag variant="info">linear</Tag>}
          {task.source === "manual" && <Tag>manuell</Tag>}
          {task.source === "chat" && <Tag variant="brand">chat</Tag>}
        </div>
        {task.description && (
          <p style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5, marginBottom: 12 }}>
            {task.description}
          </p>
        )}
      </div>

      {review ? <QualityMetrics review={review} /> : (
        <>
          <SectionLabel>KVALITETSRAPPORT</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, marginBottom: 20 }}>
            {["KVALITET", "FILER", "STATUS"].map((l, i) => (
              <div key={i} style={{ background: T.subtle, padding: "12px 16px", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: T.textFaint }}>—</div>
              </div>
            ))}
          </div>
        </>
      )}

      {task.labels && task.labels.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: T.mono }}>
            SUB-TASKS
          </div>
          {task.labels.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < task.labels.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: task.status === "done" ? T.success : T.textFaint, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: T.textSec, fontFamily: T.mono }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {task.errorMessage && (
        <>
          <SectionLabel>FEILMELDING</SectionLabel>
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, fontSize: 12, fontFamily: T.mono, color: T.error, marginBottom: 20, lineHeight: 1.5 }}>
            {task.errorMessage}
          </div>
        </>
      )}

      {task.prUrl && (
        <>
          <SectionLabel>PR</SectionLabel>
          <div style={{ marginBottom: 20 }}>
            <a href={task.prUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontFamily: T.mono, color: T.accent }}>
              {task.prUrl}
            </a>
          </div>
        </>
      )}

      {task.status === "in_review" && review && review.status === "pending" && (
        <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
          <Btn primary sm onClick={onApprove}>
            {actionLoading === "approve" ? "..." : "Godkjenn"}
          </Btn>
          <Btn sm onClick={onRequestChanges}>
            {actionLoading === "changes" ? "..." : "Be om endringer"}
          </Btn>
          <Btn sm onClick={onReject} style={{ color: T.error, borderColor: "rgba(99,102,241,0.3)" }}>
            {actionLoading === "reject" ? "..." : "Avvis"}
          </Btn>
        </div>
      )}
    </div>
  );
}
