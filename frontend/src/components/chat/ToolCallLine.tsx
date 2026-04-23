"use client";

// --- ToolCallLine (U2) ---
// Indented text-line that represents a single tool call in the AgentStream.
// Visual level matches agent.thought — no card, no bubble. Hover reveals a
// "Detaljer"-link; click anywhere on the line triggers onClick (used by U3
// to open the detail modal).

import { type CSSProperties, useState } from "react";
import { T } from "@/lib/tokens";
import { Check, AlertTriangle, Loader2, ChevronRight, MinusCircle, Info } from "lucide-react";
import type { LineStatus, ToolCallLineData } from "./types";

export interface ToolCallLineProps {
  data: ToolCallLineData;
  onClick?: (data: ToolCallLineData) => void;
}

// Per-tool subtitle formatting. Pulls readable context out of the input
// payload so the line can say "app/page.tsx (2.1 KB)" instead of just
// "repo_write_file". Keep lookups cheap — this runs for every line in view.
function formatSubtitle(data: ToolCallLineData): string {
  const { toolName, input, result } = data;
  const i = (input ?? {}) as Record<string, unknown>;
  const r = (result ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case "repo_read_file":
    case "read_file": {
      const path = String(i.path ?? "");
      const content = typeof (r as { content?: string }).content === "string" ? (r as { content: string }).content : "";
      const size = content ? ` (${formatBytes(content.length)})` : "";
      return `${path}${size}`;
    }
    case "repo_write_file":
    case "write_file":
      return String(i.path ?? "");
    case "repo_get_tree":
      return `${String(i.owner ?? "")}/${String(i.repo ?? "")}`;
    case "repo_find_relevant_files":
      return String(i.taskDescription ?? "").slice(0, 60);
    case "repo_create_pr":
      return String(i.title ?? "");
    case "memory_search":
    case "recall_memory":
      return `"${String(i.query ?? "")}"`;
    case "memory_store":
    case "save_insight":
    case "save_decision":
      return String(i.title ?? i.content ?? "").slice(0, 60);
    case "memory_search_patterns":
      return `"${String(i.errorMessage ?? "").slice(0, 60)}"`;
    case "task_get":
      return String(i.taskId ?? "").slice(0, 8);
    case "task_update_status":
      return `→ ${String(i.status ?? "")}`;
    case "task_plan":
    case "task_assess_complexity":
      return String(i.taskDescription ?? "").slice(0, 60);
    case "task_decompose_project":
      return String(i.userMessage ?? "").slice(0, 60);
    case "build_create_sandbox":
      return `${String(i.repoOwner ?? "")}/${String(i.repoName ?? "")}`;
    case "build_validate":
      return String(i.sandboxId ?? "").slice(0, 8);
    case "build_run_command":
      return `${String(i.command ?? "").slice(0, 60)}...`;
    case "build_get_status":
      return String(i.jobId ?? "").slice(0, 8);
    case "search_skills":
      return String(i.context ?? "");
    case "activate_skill":
      return String(i.id ?? "").slice(0, 8);
    case "find_component":
    case "use_component":
      return String(i.name ?? i.query ?? "");
    case "request_human_clarification":
      return String(i.question ?? "");
    case "sleep_now":
      return "global";
    case "forget_memory":
      return String(i.id ?? "").slice(0, 8);
    case "create_task":
    case "start_task":
      return String(i.title ?? i.taskId ?? "");
    default:
      return "";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function StatusIcon({ status }: { status: LineStatus }) {
  const size = 14;
  switch (status) {
    case "pending":
      return <ChevronRight size={size} color={T.textFaint} />;
    case "running":
      return <Loader2 size={size} color={T.accent} className="tf-spin" />;
    case "done":
      return <Check size={size} color={T.success} />;
    case "error":
      return <AlertTriangle size={size} color={T.error} />;
    case "skipped":
      return <MinusCircle size={size} color={T.textMuted} />;
    case "info":
    default:
      return <Info size={size} color={T.textFaint} />;
  }
}

const lineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingLeft: 20,
  paddingTop: 3,
  paddingBottom: 3,
  cursor: "pointer",
  transition: "background 150ms ease",
  borderRadius: 4,
};

export default function ToolCallLine({ data, onClick }: ToolCallLineProps) {
  const [hovered, setHovered] = useState(false);
  const subtitle = formatSubtitle(data);

  return (
    <>
      <style>{`
        @keyframes tf-spin { to { transform: rotate(360deg); } }
        .tf-spin { animation: tf-spin 1s linear infinite; }
      `}</style>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${data.toolName} ${subtitle} — ${data.status}`}
        onClick={() => onClick?.(data)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.(data);
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...lineStyle,
          background: hovered ? T.subtle : "transparent",
        }}
      >
        <StatusIcon status={data.status} />
        <span
          style={{
            fontFamily: T.mono,
            fontSize: 12,
            color: data.isError ? T.error : T.text,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {data.toolName}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: 12,
              color: T.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
            title={subtitle}
          >
            — {subtitle}
          </span>
        )}
        {typeof data.durationMs === "number" && data.status !== "pending" && (
          <span
            style={{
              fontSize: 11,
              color: T.textFaint,
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {formatDuration(data.durationMs)}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            color: T.textMuted,
            flexShrink: 0,
            opacity: hovered ? 1 : 0,
            transition: "opacity 150ms ease",
            textDecoration: "underline",
          }}
        >
          Detaljer
        </span>
      </div>
    </>
  );
}
