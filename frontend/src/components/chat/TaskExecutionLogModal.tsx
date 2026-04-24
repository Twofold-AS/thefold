"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Flag, Wrench, Check, Users, AlertTriangle, Sparkles, BookOpen, Shield,
  X, Download, ChevronDown, ChevronRight, Search,
} from "lucide-react";
import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import { getTaskLog, type TaskLogResponse, type TaskLogEvent } from "@/lib/api/agent";

interface TaskExecutionLogModalProps {
  taskId: string;
  onClose: () => void;
}

// Event-type → (icon, label, tone) mapping. Drives timeline rendering.
// Tone: "default" | "success" | "error" | "info" — colours the icon only.
function eventPresentation(type: string): {
  icon: React.ReactNode;
  label: string;
  tone: "default" | "success" | "error" | "info";
} {
  switch (type) {
    case "agent.status":
      return { icon: <Flag size={14} />, label: "Fase", tone: "info" };
    case "agent.tool_use":
      return { icon: <Wrench size={14} />, label: "Tool-kall", tone: "default" };
    case "agent.tool_result":
      return { icon: <Check size={14} />, label: "Tool-resultat", tone: "success" };
    case "agent.tool_error":
      return { icon: <AlertTriangle size={14} />, label: "Tool-feil", tone: "error" };
    case "agent.error":
      return { icon: <AlertTriangle size={14} />, label: "Feil", tone: "error" };
    case "agent.done":
      return { icon: <Check size={14} />, label: "Ferdig", tone: "success" };
    case "agent.progress":
      return { icon: <Flag size={14} />, label: "Fremdrift", tone: "default" };
    case "agent.thinking":
      return { icon: <BookOpen size={14} />, label: "Tenker", tone: "default" };
    case "agent.skills_active":
      return { icon: <Sparkles size={14} />, label: "Skills aktivert", tone: "info" };
    case "subagent.started":
      return { icon: <Users size={14} />, label: "Sub-agent startet", tone: "info" };
    case "subagent.progress":
      return { icon: <Users size={14} />, label: "Sub-agent fremdrift", tone: "default" };
    case "subagent.status_change":
      return { icon: <Users size={14} />, label: "Sub-agent status", tone: "default" };
    case "subagent.completed":
      return { icon: <Users size={14} />, label: "Sub-agent ferdig", tone: "success" };
    default:
      return { icon: <Flag size={14} />, label: type, tone: "default" };
  }
}

function toneColor(tone: "default" | "success" | "error" | "info"): string {
  switch (tone) {
    case "success": return T.success;
    case "error": return T.error;
    case "info": return T.accent;
    default: return T.textMuted;
  }
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("nb-NO", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function fmtCost(usd: number): string {
  if (!usd) return "$0";
  return `$${usd.toFixed(4)}`;
}

/** One timeline row. Expandable for full payload inspection. */
function TimelineRow({
  event, forceExpanded,
}: {
  event: TaskLogEvent;
  forceExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean>(!!forceExpanded);
  const pres = eventPresentation(event.type);
  const descPrimary = useMemo(() => {
    if (event.toolName) return event.toolName;
    if (event.phase) return event.phase;
    if (event.subAgentRole) return event.subAgentRole;
    const msg = (event.payload as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
    return "";
  }, [event]);

  // Errors are always expanded by default.
  const isError = event.type === "agent.error" || event.type === "agent.tool_error";
  const effectivelyExpanded = isError || expanded;

  return (
    <div
      style={{
        borderLeft: `2px solid ${toneColor(pres.tone)}`,
        paddingLeft: 10,
        marginBottom: 6,
      }}
    >
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          fontSize: 12,
          fontFamily: T.mono,
          color: T.textSec,
          padding: "4px 0",
          userSelect: "none",
        }}
      >
        <span style={{ color: T.textFaint, minWidth: 60 }}>{fmtTime(event.timestamp)}</span>
        <span style={{ color: toneColor(pres.tone), display: "inline-flex", alignItems: "center" }}>
          {pres.icon}
        </span>
        <span style={{ fontWeight: 500, color: T.text }}>{pres.label}</span>
        {descPrimary && (
          <span style={{ color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            — {descPrimary}
          </span>
        )}
        {effectivelyExpanded
          ? <ChevronDown size={12} color={T.textFaint} />
          : <ChevronRight size={12} color={T.textFaint} />
        }
      </div>
      {effectivelyExpanded && (
        <pre
          style={{
            margin: "4px 0 8px 0",
            padding: 10,
            background: T.subtle,
            border: `1px solid ${T.border}`,
            borderRadius: 4,
            fontSize: 11,
            fontFamily: T.mono,
            color: T.textSec,
            overflow: "auto",
            maxHeight: 260,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function TaskExecutionLogModal({ taskId, onClose }: TaskExecutionLogModalProps) {
  const [data, setData] = useState<TaskLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTaskLog(taskId)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  // Esc to close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data.events;
    const q = query.toLowerCase();
    return data.events.filter((e) => {
      if (e.type.toLowerCase().includes(q)) return true;
      if (e.toolName && e.toolName.toLowerCase().includes(q)) return true;
      if (e.phase && e.phase.toLowerCase().includes(q)) return true;
      const payloadStr = JSON.stringify(e.payload).toLowerCase();
      return payloadStr.includes(q);
    });
  }, [data, query]);

  function handleExport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-log-${taskId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(800px, 95vw)",
          height: "80vh",
          background: T.sidebar,
          border: `1px solid ${T.border}`,
          borderRadius: T.r,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: `${S.md}px ${S.lg}px`,
            borderBottom: `1px solid ${T.border}`,
            display: "flex",
            alignItems: "flex-start",
            gap: S.md,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data?.task.title ?? (loading ? "Laster..." : "—")}
            </div>
            <div style={{ display: "flex", gap: S.md, alignItems: "center", fontSize: 11, fontFamily: T.mono, color: T.textMuted, flexWrap: "wrap" }}>
              {data && <Tag variant={data.task.status === "done" ? "accent" : data.task.status === "failed" ? "error" : "default"}>{data.task.status}</Tag>}
              {data && <span>Varighet: {fmtDuration(data.task.durationMs)}</span>}
              {data && <span>Kostnad: {fmtCost(data.summary.totalCost)}</span>}
              {data && <span>{data.summary.totalToolCalls} tool-kall</span>}
              {data && data.summary.subAgentsUsed.length > 0 && (
                <span>{data.summary.subAgentsUsed.length} sub-agenter</span>
              )}
              {data && <span>{data.events.length} events</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: T.textMuted,
              flexShrink: 0,
            }}
            aria-label="Lukk"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: `${S.md}px ${S.lg}px`,
          }}
        >
          {loading && (
            <div style={{ padding: "40px 0", textAlign: "center", color: T.textFaint, fontSize: 12 }}>
              Laster logg...
            </div>
          )}
          {error && (
            <div style={{ padding: "20px", background: `${T.error}15`, border: `1px solid ${T.error}`, borderRadius: 4, color: T.error, fontSize: 12 }}>
              Kunne ikke laste logg: {error}
            </div>
          )}
          {!loading && !error && filteredEvents.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center", color: T.textFaint, fontSize: 12 }}>
              {query ? "Ingen events matcher søket" : "Ingen events registrert for denne oppgaven"}
            </div>
          )}
          {!loading && !error && filteredEvents.map((e) => (
            <TimelineRow key={e.id} event={e} />
          ))}
        </div>

        {/* Footer — search + export */}
        <div
          style={{
            padding: `${S.sm}px ${S.lg}px`,
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            gap: S.sm,
            alignItems: "center",
            background: T.subtle,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: T.sidebar,
              border: `1px solid ${T.border}`,
              borderRadius: 4,
            }}
          >
            <Search size={14} color={T.textMuted} />
            <input
              type="text"
              placeholder="Søk events (type, tool, fase, innhold)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 12,
                fontFamily: T.mono,
                color: T.text,
              }}
            />
          </div>
          <Btn
            size="sm"
            onClick={handleExport}
            disabled={!data}
          >
            <Download size={12} style={{ marginRight: 4 }} />
            Eksporter JSON
          </Btn>
        </div>

        {/* Hidden placeholder for Shield icon imported but not used on the status-icon path —
            keeps import stable for future validation-subgrouping without re-editing. */}
        <Shield size={0} style={{ display: "none" }} aria-hidden />
      </div>
    </div>,
    document.body,
  );
}
