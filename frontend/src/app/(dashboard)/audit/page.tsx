"use client";

import { useState } from "react";
import { T, S } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { apiFetch } from "@/lib/api/client";

interface AuditEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  actionType: string;
  details: Record<string, unknown> | string | unknown;
  success: boolean | null;
  errorMessage: string | null;
}

/** Safely parse details which may arrive as a JSON string from the DB */
function parseDetails(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function getActionIcon(actionType: string): string {
  const lower = actionType.toLowerCase();
  if (lower.includes("create")) return "add_circle";
  if (lower.includes("delete")) return "delete";
  if (lower.includes("update") || lower.includes("modify")) return "edit";
  if (lower.includes("read") || lower.includes("get")) return "visibility";
  if (lower.includes("write")) return "save";
  if (lower.includes("push") || lower.includes("pull")) return "cloud_upload";
  if (lower.includes("validate")) return "check_circle";
  if (lower.includes("rate")) return "speed";
  if (lower.includes("memory")) return "psychology";
  if (lower.includes("sandbox")) return "terminal";
  if (lower.includes("review")) return "rate_review";
  return "circle";
}

function formatActionName(actionType: string): string {
  return actionType
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "boolean") return value ? "ja" : "nei";
  if (typeof value === "number") return !Number.isInteger(value) ? value.toFixed(4) : String(value);
  if (typeof value === "string") {
    if (value.length > 120) return value.slice(0, 120) + "…";
    return value;
  }
  return JSON.stringify(value);
}

function getSummary(actionType: string, details: Record<string, unknown>): string | null {
  const d = details as Record<string, string | number | boolean | undefined>;
  switch (actionType) {
    case "plan_created":
      return `"${String(d.taskDescription ?? "").slice(0, 60)}…" — modell ${d.model ?? "auto"}`;
    case "model_selected":
      return `${d.selectedModel ?? d.suggestedModel ?? "auto"} (kompleksitet ${d.complexity ?? "?"}/10)`;
    case "file_written":
      return d.filePath ?? d.path ?? "ukjent sti" as string;
    case "github_write":
      return `${d.operation ?? "skriving"} → ${d.repo ?? d.repoName ?? "repo"}`;
    case "pr_created":
      return `"${d.title ?? ""}" ${d.url ? `→ ${d.url}` : ""}`;
    case "sandbox_created":
      return `modus: ${d.mode ?? "filesystem"}`;
    case "sandbox_destroyed":
      return "sandbox avsluttet";
    case "review_submitted":
      return `kvalitet ${d.qualityScore ?? "?"}`;
    case "complexity_assessed":
      return `${d.complexity ?? "?"}${d.model ? ` — ${d.model}` : ""}`;
    case "confidence_assessed":
      return `${d.overall ?? "?"}% — ${d.recommended_action ?? "proceed"}`;
    case "task_started":
      return d.taskId ? `id: ${String(d.taskId).slice(0, 8)}` : null;
    case "task_completed":
      return d.prUrl ? `PR: ${d.prUrl}` : "fullført";
    case "task_failed":
      return String(d.errorMessage ?? d.error ?? "ukjent årsak").slice(0, 100);
    case "memory_stored":
      return `"${String(d.content ?? "").slice(0, 80)}…"`;
    case "rate_limit_checked":
      return d.allowed ? "tillatt" : "avvist";
    default:
      if (d.filePath || d.path) return String(d.filePath ?? d.path);
      if (d.taskDescription) return String(d.taskDescription).slice(0, 80);
      if (d.model) return `modell: ${d.model}`;
      return null;
  }
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("nb-NO", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return ts; }
}

export default function AuditPage() {
  const { data, loading } = useApiData(
    () => apiFetch<{ entries: AuditEntry[] }>("/agent/audit/list", { method: "POST", body: { limit: 200 } }),
    [],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "success" | "error">("all");

  const rawEntries: AuditEntry[] = data?.entries ?? [];
  const entries = rawEntries.filter(e => {
    if (filter === "success") return e.success === true;
    if (filter === "error") return e.success === false;
    return true;
  });

  const successCount = rawEntries.filter(e => e.success === true).length;
  const errorCount = rawEntries.filter(e => e.success === false).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.xl, paddingTop: 0, paddingBottom: S.xxl }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, margin: 0 }}>Audit logg</h1>
          <p style={{ fontSize: 13, color: T.textMuted, marginTop: 4, margin: "4px 0 0" }}>
            {rawEntries.length} hendelser — {successCount} ok, {errorCount} feil
          </p>
        </div>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {(["all", "success", "error"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: `1px solid ${filter === f ? T.textFaint : T.border}`,
                background: filter === f ? T.tabActive : "transparent",
                color: filter === f ? T.text : T.textMuted,
                fontSize: 11,
                cursor: "pointer",
                fontWeight: 500,
                fontFamily: T.sans,
              }}
            >
              {f === "all" ? "Alle" : f === "success" ? "OK" : "Feil"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{
        background: T.tabWrapper,
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        overflow: "hidden",
      }}>
        {loading ? (
          <div style={{ padding: S.xl, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
            Laster audit logg...
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: S.xl, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
            Ingen hendelser.
          </div>
        ) : (
          entries.map((entry, index) => {
            const details = parseDetails(entry.details);
            const summary = entry.errorMessage ?? getSummary(entry.actionType, details);
            const isExpanded = expandedId === entry.id;
            const detailKeys = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== "");

            return (
              <div key={entry.id}>
                <div
                  onClick={() => detailKeys.length > 0 && setExpandedId(isExpanded ? null : entry.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 14px",
                    borderBottom: index < entries.length - 1 || isExpanded ? `1px solid ${T.border}` : "none",
                    cursor: detailKeys.length > 0 ? "pointer" : "default",
                    background: isExpanded ? T.subtle : "transparent",
                    transition: "background 0.12s",
                  }}
                >
                  {/* Status dot */}
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: entry.success === true ? T.success : entry.success === false ? T.error : T.textFaint,
                  }} />

                  {/* Action icon */}
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: T.textMuted, flexShrink: 0 }}>
                    {getActionIcon(entry.actionType)}
                  </span>

                  {/* Action name */}
                  <span style={{ fontSize: 12, fontWeight: 500, color: T.text, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {formatActionName(entry.actionType)}
                  </span>

                  {/* Summary */}
                  {summary && (
                    <span style={{
                      fontSize: 11, color: entry.errorMessage ? T.error : T.textMuted,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
                    }}>
                      {summary}
                    </span>
                  )}
                  {!summary && <span style={{ flex: 1 }} />}

                  {/* Right: time + session + chevron */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono, whiteSpace: "nowrap" }}>
                      {fmtTime(entry.timestamp)}
                    </span>
                    <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>
                      {entry.sessionId?.slice(0, 6)}
                    </span>
                    {detailKeys.length > 0 && (
                      <span className="material-symbols-outlined" style={{
                        fontSize: 14, color: T.textFaint,
                        transform: isExpanded ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s",
                      }}>
                        expand_more
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && detailKeys.length > 0 && (
                  <div style={{
                    padding: "10px 14px 12px 30px",
                    background: T.subtle,
                    borderBottom: index < entries.length - 1 ? `1px solid ${T.border}` : "none",
                  }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px" }}>
                      {detailKeys.map(([key, value]) => (
                        <div key={key} style={{ fontSize: 11 }}>
                          <span style={{ color: T.textFaint, marginRight: 4 }}>{formatActionName(key)}:</span>
                          <span style={{ color: T.textSec, fontFamily: T.mono }}>{formatValue(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
