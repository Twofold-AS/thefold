"use client";

import { T } from "@/lib/tokens";
import Skeleton from "@/components/Skeleton";
import TaskCard from "./TaskCard";
import type { TheFoldTask, ReviewSummary } from "@/lib/api";

interface TaskListProps {
  tasks: TheFoldTask[];
  reviews: ReviewSummary[];
  selectedId: string | null;
  loading: boolean;
  hasDetail: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function TaskList({
  tasks,
  reviews,
  selectedId,
  loading,
  hasDetail,
  onSelect,
  onDelete,
}: TaskListProps) {
  return (
    <div style={{ borderRight: hasDetail ? `1px solid ${T.border}` : "none" }}>
      {loading ? (
        <div style={{ padding: "40px 20px" }}>
          <Skeleton rows={5} />
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: T.textFaint }}>Ingen oppgaver enna</span>
        </div>
      ) : (
        tasks.map((tk, i) => (
          <TaskCard
            key={tk.id}
            task={tk}
            selected={selectedId === tk.id}
            review={reviews.find(r => r.taskId === tk.id)}
            isLast={i === tasks.length - 1}
            onSelect={() => onSelect(tk.id)}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}
