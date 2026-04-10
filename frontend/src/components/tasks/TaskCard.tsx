"use client";

import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import { Trash2 } from "lucide-react";
import { mapStatus, statusLabel, timeAgo } from "./taskUtils";
import type { TheFoldTask, ReviewSummary } from "@/lib/api";

interface TaskCardProps {
  task: TheFoldTask;
  selected: boolean;
  review?: ReviewSummary;
  isLast: boolean;
  onSelect: () => void;
  onDelete: (id: string) => void;
}

export default function TaskCard({ task, selected, review, isLast, onSelect, onDelete }: TaskCardProps) {
  const st = mapStatus(task.status);

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "14px 20px",
        cursor: "pointer",
        background: selected ? T.subtle : "transparent",
        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
        transition: "all 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
          {task.id.substring(0, 8)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1 }}>
          {task.title}
        </span>
        <div
          onClick={async (e) => { e.stopPropagation(); onDelete(task.id); }}
          title="Slett oppgave"
          style={{ padding: 4, cursor: "pointer", color: T.textFaint, flexShrink: 0 }}
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </div>
        <Tag variant={st === "done" ? "success" : st === "active" ? "accent" : "default"}>
          {statusLabel(task.status)}
        </Tag>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{task.repo}</span>
        {task.source === "linear" && (
          <span style={{ fontSize: 10, fontFamily: T.mono, color: "#A5B4FC" }}>linear</span>
        )}
        {review && review.qualityScore !== null && (
          <span style={{
            fontSize: 10, fontFamily: T.mono,
            color: review.qualityScore >= 8 ? T.success : review.qualityScore >= 6 ? T.warning : T.error,
          }}>
            kvalitet: {review.qualityScore}/10
          </span>
        )}
        <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>
          {timeAgo(task.createdAt)}
        </span>
      </div>
    </div>
  );
}
