"use client";

import { useState, useEffect, useCallback } from "react";
import { T, S } from "@/lib/tokens";
import StatCard from "@/components/shared/StatCard";
import { Square, ChevronDown, ChevronUp } from "lucide-react";
import {
  listTheFoldTasks,
  listSubTasks,
  getTaskStats,
  listReviews,
  type TheFoldTask,
} from "@/lib/api";

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  return `${Math.floor(h / 24)}d`;
}

function statusColor(status: string): string {
  if (status === "done" || status === "completed") return T.success ?? "#22c55e";
  if (status === "in_progress") return T.accent ?? "#8ab4f8";
  if (status === "in_review") return T.warning ?? "#f59e0b";
  if (status === "blocked" || status === "failed") return T.error ?? "#f87171";
  return T.textMuted;
}

function statusLabel(status: string): string {
  switch (status) {
    case "done": case "completed": return "done";
    case "in_progress": return "aktiv";
    case "in_review": return "review";
    case "planned": return "planlagt";
    case "backlog": return "backlog";
    case "blocked": return "blokkert";
    default: return status;
  }
}

// ---- Sub-task row with checkbox ----
function SubTaskRow({
  sub,
  isLast,
  checked,
  onToggle,
}: {
  sub: TheFoldTask;
  isLast: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <div style={{ width: 20, minWidth: 20, alignSelf: "stretch", position: "relative", marginRight: 8 }}>
        <div style={{ position: "absolute", top: 0, bottom: isLast ? "50%" : 0, left: 8, borderLeft: `2px solid ${T.border}` }} />
        <div style={{ position: "absolute", top: "50%", left: 8, width: 12, borderBottom: `2px solid ${T.border}` }} />
      </div>
      <div
        onClick={() => onToggle(sub.id)}
        style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          padding: "7px 12px",
          background: checked ? `${T.accent}0a` : T.subtle,
          border: `1px solid ${checked ? T.accent + "40" : T.border}`,
          borderRadius: T.r,
          fontSize: 12, marginBottom: 4, cursor: "pointer",
          transition: "background 0.1s, border-color 0.1s",
        }}
      >
        {/* Checkbox */}
        <div style={{
          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
          border: `1.5px solid ${checked ? T.accent : T.textFaint}`,
          background: checked ? T.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {checked && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
        </div>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(sub.status), flexShrink: 0 }} />
        <span style={{ flex: 1, color: T.text }}>{sub.title}</span>
        <span style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 4,
          background: `${statusColor(sub.status)}20`, color: statusColor(sub.status),
          fontFamily: T.mono,
        }}>{statusLabel(sub.status)}</span>
        {sub.createdAt && <span style={{ fontSize: 10, color: T.textFaint }}>{timeAgo(sub.createdAt)}</span>}
      </div>
    </div>
  );
}

// ---- Expandable task row with master checkbox ----
function LiveTaskRow({
  task,
  selectedIds,
  onToggleSub,
  onToggleAll,
}: {
  task: TheFoldTask;
  selectedIds: Set<string>;
  onToggleSub: (id: string) => void;
  onToggleAll: (subIds: string[], allSelected: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subTasks, setSubTasks] = useState<TheFoldTask[] | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  const fetchSubs = useCallback(async () => {
    setSubLoading(true);
    try {
      const r = await listSubTasks(task.id);
      setSubTasks(r.tasks);
    } catch {
      setSubTasks([]);
    } finally {
      setSubLoading(false);
    }
  }, [task.id]);

  const toggleExpand = async () => {
    if (!expanded && subTasks === null) {
      await fetchSubs();
    }
    setExpanded(p => !p);
  };

  const subIds = (subTasks ?? []).map(s => s.id);
  const allSubSelected = subIds.length > 0 && subIds.every(id => selectedIds.has(id));
  const someSubSelected = subIds.some(id => selectedIds.has(id));

  const handleMasterToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (subTasks === null) {
      setSubLoading(true);
      try {
        const r = await listSubTasks(task.id);
        setSubTasks(r.tasks);
        const ids = r.tasks.map((s: TheFoldTask) => s.id);
        onToggleAll(ids, ids.every(id => selectedIds.has(id)));
      } catch {
        setSubTasks([]);
      } finally {
        setSubLoading(false);
      }
    } else {
      onToggleAll(subIds, allSubSelected);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          border: `1px solid ${someSubSelected ? T.accent + "40" : T.border}`,
          borderRadius: T.r,
          background: task.status === "in_progress" ? `${T.accent}08` : T.raised,
          cursor: "pointer",
        }}
        onClick={toggleExpand}
      >
        {/* Master checkbox */}
        <div
          onClick={handleMasterToggle}
          style={{
            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
            border: `1.5px solid ${allSubSelected ? T.accent : someSubSelected ? T.accent : T.textFaint}`,
            background: allSubSelected ? T.accent : someSubSelected ? `${T.accent}40` : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {allSubSelected && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
          {someSubSelected && !allSubSelected && <span style={{ color: T.accent, fontSize: 10, lineHeight: 1 }}>–</span>}
        </div>

        {/* Status indicator */}
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: statusColor(task.status),
          boxShadow: task.status === "in_progress" ? `0 0 0 3px ${T.accent}30` : undefined,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.title}
          </div>
          {task.repo && (
            <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, marginTop: 2 }}>{task.repo}</div>
          )}
        </div>
        <span style={{
          fontSize: 10, padding: "2px 7px", borderRadius: 4,
          background: `${statusColor(task.status)}18`, color: statusColor(task.status),
          fontFamily: T.mono, whiteSpace: "nowrap",
        }}>{statusLabel(task.status)}</span>
        {task.createdAt && <span style={{ fontSize: 10, color: T.textFaint, whiteSpace: "nowrap" }}>{timeAgo(task.createdAt)}</span>}
        {expanded
          ? <ChevronUp size={14} color={T.textMuted} style={{ flexShrink: 0 }} />
          : <ChevronDown size={14} color={T.textMuted} style={{ flexShrink: 0 }} />}
      </div>

      {expanded && (
        <div style={{ marginLeft: 28, marginTop: 4 }}>
          {subLoading ? (
            <div style={{ fontSize: 11, color: T.textMuted, padding: "6px 0" }}>Laster deloppgaver...</div>
          ) : (subTasks ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: T.textFaint, padding: "6px 0" }}>Ingen deloppgaver</div>
          ) : (
            (subTasks ?? []).map((sub, i) => (
              <SubTaskRow
                key={sub.id}
                sub={sub}
                isLast={i === (subTasks ?? []).length - 1}
                checked={selectedIds.has(sub.id)}
                onToggle={onToggleSub}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---- Section header ----
function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, background: T.subtle, padding: "1px 6px", borderRadius: 4 }}>{count}</span>
    </div>
  );
}

// ---- Pulsing dot ----
function PulsingDot() {
  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .pulse-dot { position: relative; display: inline-flex; align-items: center; justify-content: center; }
        .pulse-dot::before {
          content: '';
          position: absolute;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #22c55e;
          animation: pulse-ring 1.4s ease-out infinite;
        }
      `}</style>
      <div className="pulse-dot" style={{ width: 10, height: 10, flexShrink: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", position: "relative", zIndex: 1 }} />
      </div>
    </>
  );
}

export default function AutoPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Live task polling
  const [tasks, setTasks] = useState<TheFoldTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  const fetchTasks = useCallback(async () => {
    try {
      const [taskResult, reviewResult] = await Promise.all([
        listTheFoldTasks({ rootOnly: true, limit: 50 }),
        listReviews({ status: "pending_review", limit: 5 }),
      ]);
      setTasks(taskResult.tasks);
      setPendingReviewCount(reviewResult.reviews?.length ?? 0);
    } catch { /* ignore */ }
    finally { setTasksLoading(false); }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Checkbox helpers
  const handleToggleSub = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleToggleAll = (subIds: string[], allSelected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) subIds.forEach(id => next.delete(id));
      else subIds.forEach(id => next.add(id));
      return next;
    });
  };

  // Partition tasks
  const activeTasks = tasks.filter(t => t.status === "in_progress");
  const reviewTasks = tasks.filter(t => t.status === "in_review");
  const pendingTasks = tasks.filter(t => t.status === "backlog" || t.status === "planned");
  const doneTasks = tasks.filter(t => t.status === "done" || t.status === "completed");
  const blockedTasks = tasks.filter(t => t.status === "blocked");

  // Use tasks.length (root tasks only) for the count display — not statsData.total which includes sub-tasks
  const rootTaskCount = tasks.length;
  const completedTaskCount = doneTasks.length;

  const renderSection = (sectionTasks: TheFoldTask[], label: string) => {
    if (sectionTasks.length === 0) return null;
    return (
      <div key={label}>
        <SectionTitle label={label} count={sectionTasks.length} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sectionTasks.map(task => (
            <LiveTaskRow
              key={task.id}
              task={task}
              selectedIds={selectedIds}
              onToggleSub={handleToggleSub}
              onToggleAll={handleToggleAll}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: `${S.lg}px ${S.xl}px ${S.xxl}px` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: S.xl }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0 }}>Auto</h1>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  color: T.textMuted, border: `1px solid ${T.border}`,
                  padding: "2px 8px", borderRadius: 20, lineHeight: "16px",
                  fontFamily: T.sans,
                }}>BETA</span>
              </div>
              <p style={{ fontSize: 13, color: T.textMuted, marginTop: S.xs }}>
                Autonom modus — TheFold jobber selvstendig, tester og validerer uten reviews.
              </p>
            </div>
          </div>

          {/* Stats — no "Status" box */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: S.md }}>
            <StatCard label="Masteroppgaver" value={rootTaskCount} />
            <StatCard label="Ventende reviews" value={pendingReviewCount} color="warning" />
            <StatCard label="Fullførte" value={completedTaskCount} color="success" />
          </div>

          {/* Agent status bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            background: activeTasks.length > 0 ? `${T.accent}08` : T.raised,
            border: `1px solid ${activeTasks.length > 0 ? T.accent + "30" : T.border}`,
            borderRadius: T.r,
          }}>
            {activeTasks.length > 0 ? <PulsingDot /> : (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.textFaint, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 13, color: activeTasks.length > 0 ? T.text : T.textFaint, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeTasks.length > 0
                ? `Jobber med: ${activeTasks[0].title}${activeTasks.length > 1 ? ` (+${activeTasks.length - 1})` : ""}`
                : "Ingen aktive operasjoner"}
            </span>
            {/* Control buttons use selectedIds */}
            {selectedIds.size > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>{selectedIds.size} valgt</span>
                <button
                  onClick={() => setIsRunning(true)}
                  style={{ padding: "4px 12px", fontSize: 11, color: "#fff", background: T.accent, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: T.sans }}
                >
                  Start
                </button>
                <button
                  onClick={() => { setIsRunning(false); }}
                  style={{ padding: "4px 10px", fontSize: 11, color: T.textMuted, background: T.subtle, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", fontFamily: T.sans, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <Square size={10} /> Stopp
                </button>
              </div>
            )}
            {selectedIds.size === 0 && activeTasks.length > 0 && (
              <button
                onClick={() => { setIsRunning(false); }}
                style={{ padding: "4px 10px", fontSize: 11, color: T.textMuted, background: T.subtle, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", fontFamily: T.sans, display: "flex", alignItems: "center", gap: 4 }}
              >
                <Square size={10} /> Stopp
              </button>
            )}
          </div>

          {/* Active task highlight */}
          {!tasksLoading && activeTasks.length > 0 && (
            <div style={{
              background: `${T.accent}08`,
              border: `1px solid ${T.accent}30`,
              borderRadius: T.r,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}>
              <PulsingDot />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                  Pågår nå {activeTasks.length > 1 ? `(${activeTasks.length})` : ""}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeTasks[0].title}
                </div>
                {activeTasks[0].repo && (
                  <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, marginTop: 3 }}>
                    {activeTasks[0].repo}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Task list */}
          {tasksLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
              Laster oppgaver...
            </div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: T.textMuted, fontSize: 13, border: `1px solid ${T.border}`, borderRadius: T.r }}>
              Ingen oppgaver ennå — gå til Oppgaver for å opprette nye.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: S.xl }}>
              {renderSection(activeTasks, "Pågår")}
              {renderSection(reviewTasks, "Review")}
              {renderSection(pendingTasks, "Venter")}
              {renderSection(blockedTasks, "Blokkert")}
              {renderSection(doneTasks, "Fullført")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
