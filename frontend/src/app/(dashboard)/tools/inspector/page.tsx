"use client";

import { useState } from "react";
import {
  getTaskTrace,
  getTaskMetrics,
  type AuditLogEntry,
  type TaskCostBreakdown,
} from "@/lib/api";

// --- Helpers ---

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `<$0.001`;
  return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}K`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ACTION_LABELS: Record<string, string> = {
  confidence_assessed: "Konfidensanalyse",
  complexity_assessed: "Kompleksitetsvurdering",
  plan_generated: "Plan generert",
  plan_revised: "Plan revidert",
  builder_executed: "Builder kjort",
  validation_run: "Validering",
  diagnosis_run: "Diagnose",
  review_completed: "Review fullfort",
  github_write: "GitHub PR",
  task_completed: "Oppgave fullfort",
  task_failed: "Oppgave feilet",
  memory_stored: "Minne lagret",
  sub_agents_dispatched: "Sub-agenter",
  sandbox_created: "Sandbox opprettet",
  context_built: "Kontekst bygget",
};

const OUTCOME_STYLES: Record<string, { color: string; label: string }> = {
  completed: { color: "#22c55e", label: "Fullfort" },
  failed: { color: "#ef4444", label: "Feilet" },
  paused: { color: "#eab308", label: "Pauset" },
  in_progress: { color: "#3b82f6", label: "Pagar" },
};

// --- Component ---

export default function InspectorPage() {
  const [taskId, setTaskId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [summary, setSummary] = useState<{
    totalSteps: number;
    totalDurationMs: number;
    successCount: number;
    failureCount: number;
    confidenceScore: number | null;
    outcome: "completed" | "failed" | "paused" | "in_progress";
  } | null>(null);
  const [breakdown, setBreakdown] = useState<TaskCostBreakdown | null>(null);

  async function handleInspect() {
    const id = taskId.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    setEntries([]);
    setSummary(null);
    setBreakdown(null);

    try {
      const [traceRes, metricsRes] = await Promise.all([
        getTaskTrace(id),
        getTaskMetrics(id).catch(() => ({ breakdown: null })),
      ]);

      if (!traceRes.entries.length) {
        setError("Ingen data funnet for denne task-IDen.");
        return;
      }

      setEntries(traceRes.entries);
      setSummary(traceRes.summary);
      setBreakdown(metricsRes.breakdown);
    } catch {
      setError("Kunne ikke hente data. Sjekk at task-IDen er korrekt.");
    } finally {
      setLoading(false);
    }
  }

  // --- Derived data ---
  const contextEntries = entries.filter((e) =>
    ["context_built", "sandbox_created"].includes(e.actionType)
  );
  const executionEntries = entries.filter((e) =>
    !["context_built", "sandbox_created"].includes(e.actionType)
  );

  // Extract context details from entries
  const contextDetails = contextEntries.find((e) => e.actionType === "context_built")?.details as
    | { filesCount?: number; memoryCount?: number; tokensEstimate?: number; treeSize?: number }
    | undefined;

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="card">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Task-ID (f.eks. TWO-78 eller UUID)"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInspect()}
            className="flex-1 px-3 py-2 text-sm font-mono bg-transparent outline-none"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={handleInspect}
            disabled={loading || !taskId.trim()}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: loading ? "var(--border)" : "var(--text-primary)",
              color: "var(--bg-primary)",
              opacity: loading || !taskId.trim() ? 0.5 : 1,
            }}
          >
            {loading ? "Laster..." : "Inspiser"}
          </button>
        </div>
        {error && (
          <p className="text-sm mt-2" style={{ color: "#ef4444" }}>{error}</p>
        )}
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="card">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Status</span>
              <p className="text-sm font-medium" style={{ color: OUTCOME_STYLES[summary.outcome]?.color || "var(--text-primary)" }}>
                {OUTCOME_STYLES[summary.outcome]?.label || summary.outcome}
              </p>
            </div>
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Steg</span>
              <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{summary.totalSteps}</p>
            </div>
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Varighet</span>
              <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{fmtMs(summary.totalDurationMs)}</p>
            </div>
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Suksess / Feil</span>
              <p className="text-sm font-mono">
                <span style={{ color: "#22c55e" }}>{summary.successCount}</span>
                {" / "}
                <span style={{ color: summary.failureCount > 0 ? "#ef4444" : "var(--text-muted)" }}>{summary.failureCount}</span>
              </p>
            </div>
            {summary.confidenceScore !== null && (
              <div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Konfidens</span>
                <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
                  {(summary.confidenceScore * 100).toFixed(0)}%
                </p>
              </div>
            )}
            {breakdown && (
              <>
                <div>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Total kostnad</span>
                  <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{fmtCost(breakdown.totalCostUsd)}</p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Tokens</span>
                  <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{fmtTokens(breakdown.totalTokens)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Three-panel layout */}
      {entries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panel 1: Context */}
          <div className="card">
            <h3 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Kontekst
            </h3>
            {contextDetails ? (
              <div className="space-y-2">
                {contextDetails.filesCount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Filer valgt</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>{contextDetails.filesCount}</span>
                  </div>
                )}
                {contextDetails.memoryCount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Memory-treff</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>{contextDetails.memoryCount}</span>
                  </div>
                )}
                {contextDetails.treeSize !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Repo-filer</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>{contextDetails.treeSize}</span>
                  </div>
                )}
                {contextDetails.tokensEstimate !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Tokens (est.)</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>{fmtTokens(contextDetails.tokensEstimate)}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Ingen kontekstdata tilgjengelig</p>
            )}

            {/* Sandbox info */}
            {contextEntries.filter((e) => e.actionType === "sandbox_created").length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Sandbox</span>
                <p className="text-xs font-mono mt-1" style={{ color: "#22c55e" }}>Opprettet</p>
              </div>
            )}
          </div>

          {/* Panel 2: Execution Timeline */}
          <div className="card lg:col-span-1">
            <h3 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Tidslinje
            </h3>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {executionEntries.map((entry, i) => (
                <TimelineEntry key={entry.id || i} entry={entry} />
              ))}
              {executionEntries.length === 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Ingen steg registrert</p>
              )}
            </div>
          </div>

          {/* Panel 3: Cost Breakdown */}
          <div className="card">
            <h3 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Kostnadsfordeling
            </h3>
            {breakdown ? (
              <div className="space-y-2">
                {breakdown.phases.map((phase) => (
                  <div key={phase.phase} className="py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                        {phase.phase}
                      </span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                        {fmtCost(phase.costUsd)}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {fmtTokens(phase.tokensInput + phase.tokensOutput)} tokens
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {fmtMs(phase.durationMs)}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {phase.model}
                      </span>
                      {phase.cachedTokens > 0 && (
                        <span className="text-[10px]" style={{ color: "#22c55e" }}>
                          {fmtTokens(phase.cachedTokens)} cached
                        </span>
                      )}
                    </div>
                    {/* Token bar */}
                    {breakdown.totalTokens > 0 && (
                      <div className="mt-1 h-1 w-full" style={{ background: "var(--border)" }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.max(2, ((phase.tokensInput + phase.tokensOutput) / breakdown.totalTokens) * 100)}%`,
                            background: "var(--text-muted)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {/* Totals */}
                <div className="pt-2 flex justify-between">
                  <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Totalt</span>
                  <span className="text-xs font-mono font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtCost(breakdown.totalCostUsd)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {entries.length > 0 ? "Ingen kostnadsdata for denne tasken" : "Sok etter en task for a se kostnader"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && !error && (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Skriv inn en task-ID for a inspisere agent-kjoring steg for steg.
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            Data fra audit log, fase-metrics og kontekst-bygging visualiseres her.
          </p>
        </div>
      )}
    </div>
  );
}

// --- Timeline Entry Component ---

function TimelineEntry({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const label = ACTION_LABELS[entry.actionType] || entry.actionType;
  const isError = entry.success === false;

  return (
    <div
      className="py-1.5 px-2 cursor-pointer transition-colors"
      style={{
        borderLeft: `2px solid ${isError ? "#ef4444" : entry.success ? "#22c55e" : "var(--border)"}`,
        background: expanded ? "var(--bg-secondary)" : "transparent",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
            {fmtTime(entry.timestamp)}
          </span>
          <span className="text-xs" style={{ color: isError ? "#ef4444" : "var(--text-primary)" }}>
            {label}
          </span>
        </div>
        {entry.durationMs !== null && (
          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
            {fmtMs(entry.durationMs)}
          </span>
        )}
      </div>

      {/* Error message */}
      {isError && entry.errorMessage && (
        <p className="text-[10px] mt-0.5 font-mono" style={{ color: "#ef4444" }}>
          {entry.errorMessage.substring(0, 120)}
        </p>
      )}

      {/* Expanded details */}
      {expanded && entry.details && Object.keys(entry.details).length > 0 && (
        <div className="mt-2 pl-2" style={{ borderLeft: "1px solid var(--border)" }}>
          {Object.entries(entry.details).map(([key, value]) => (
            <div key={key} className="flex gap-2 py-0.5">
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{key}:</span>
              <span className="text-[10px] font-mono break-all" style={{ color: "var(--text-secondary)" }}>
                {typeof value === "object" ? JSON.stringify(value, null, 1).substring(0, 200) : String(value).substring(0, 200)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
