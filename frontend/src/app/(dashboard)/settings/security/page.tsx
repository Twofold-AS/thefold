"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  listAuditLog,
  getAuditStats,
  type AuditLogEntry,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

const ACTION_LABELS: Record<string, string> = {
  task_read: "Les oppgave",
  project_tree_read: "Les prosjektstruktur",
  relevant_files_identified: "Identifiser relevante filer",
  files_read: "Les filer",
  memory_searched: "Søk i minner",
  docs_looked_up: "Slå opp dokumentasjon",
  confidence_assessed: "Vurder confidence",
  confidence_details: "Confidence-detaljer",
  task_paused_clarification: "Stoppet — trenger avklaring",
  task_paused_breakdown: "Stoppet — anbefaler oppdeling",
  plan_created: "Plan opprettet",
  plan_retry: "Plan retry",
  sandbox_created: "Sandbox opprettet",
  sandbox_destroyed: "Sandbox slettet",
  file_written: "Fil skrevet",
  file_deleted: "Fil slettet",
  command_executed: "Kommando kjørt",
  validation_run: "Validering kjørt",
  validation_failed: "Validering feilet",
  review_completed: "Review fullført",
  pr_created: "PR opprettet",
  linear_updated: "Linear oppdatert",
  memory_stored: "Minne lagret",
  task_completed: "Oppgave fullført",
  task_failed: "Oppgave feilet",
};

const FILTER_OPTIONS = [
  { value: "", label: "Alle handlinger" },
  { value: "task_completed", label: "Fullførte oppgaver" },
  { value: "task_failed", label: "Feilede oppgaver" },
  { value: "pr_created", label: "PRs opprettet" },
  { value: "validation_failed", label: "Validering feilet" },
  { value: "confidence_details", label: "Confidence-vurderinger" },
  { value: "file_written", label: "Filer skrevet" },
  { value: "plan_created", label: "Planer opprettet" },
];

export default function SecurityPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState<{
    totalEntries: number;
    totalTasks: number;
    successRate: number;
    averageDurationMs: number;
  } | null>(null);

  const pageSize = 25;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAuditLog({
        actionType: filter || undefined,
        failedOnly: failedOnly || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch {
      // Ignore errors on initial load (service might not have data yet)
    } finally {
      setLoading(false);
    }
  }, [filter, failedOnly, page]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getAuditStats();
      setStats(result);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <PageHeaderBar title="Security" />
      <div className="p-6">

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <StatCard label="Totalt handlinger" value={stats.totalEntries.toString()} />
          <StatCard label="Oppgaver behandlet" value={stats.totalTasks.toString()} />
          <StatCard label="Suksessrate" value={`${stats.successRate}%`} />
          <StatCard
            label="Snitt varighet"
            value={stats.averageDurationMs > 1000
              ? `${(stats.averageDurationMs / 1000).toFixed(1)}s`
              : `${stats.averageDurationMs}ms`
            }
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mt-8 mb-4">
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          className="input-field text-sm w-auto"
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => { setFailedOnly(e.target.checked); setPage(0); }}
            className="rounded"
          />
          Kun feil
        </label>

        <button
          onClick={() => { loadEntries(); loadStats(); }}
          className="btn-secondary text-sm"
        >
          Oppdater
        </button>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--sidebar-text-active)" }}
          />
        </div>
      ) : entries.length === 0 ? (
        <div
          className="text-center py-12"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Ingen audit-logg enda. Agenten logger handlinger her under oppgavekjøring.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Viser {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} av {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="btn-secondary text-xs px-3 py-1"
                >
                  Forrige
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-secondary text-xs px-3 py-1"
                >
                  Neste
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="p-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-xl font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const label = ACTION_LABELS[entry.actionType] || entry.actionType;
  const time = new Date(entry.timestamp).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const statusColor = entry.success === true
    ? "var(--success)"
    : entry.success === false
      ? "var(--error)"
      : "var(--text-muted)";

  return (
    <div
      className="px-4 py-2.5 cursor-pointer transition-colors"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${expanded ? "var(--accent)" : "var(--border)"}`,
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: statusColor }}
        />

        {/* Action label */}
        <span className="text-sm font-medium flex-1" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>

        {/* Task ID */}
        {entry.taskId && (
          <span
            className="text-[10px] px-2 py-0.5"
            style={{ background: "var(--bg-sidebar)", color: "var(--text-muted)" }}
          >
            {entry.taskId.substring(0, 8)}
          </span>
        )}

        {/* Duration */}
        {entry.durationMs !== null && (
          <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            {entry.durationMs > 1000 ? `${(entry.durationMs / 1000).toFixed(1)}s` : `${entry.durationMs}ms`}
          </span>
        )}

        {/* Timestamp */}
        <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {time}
        </span>

        {/* Expand indicator */}
        <svg
          className="w-3 h-3 transition-transform flex-shrink-0"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", color: "var(--text-muted)" }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </div>

      {/* Error message */}
      {entry.errorMessage && !expanded && (
        <p className="text-xs mt-1 truncate" style={{ color: "var(--error)" }}>
          {entry.errorMessage}
        </p>
      )}

      {/* Expanded details */}
      {expanded && (
        <div
          className="mt-3 p-3 text-xs font-mono overflow-auto max-h-[300px]"
          style={{ background: "var(--bg-sidebar)", color: "var(--text-secondary)" }}
        >
          {entry.errorMessage && (
            <div className="mb-2">
              <span className="font-semibold" style={{ color: "var(--error)" }}>Feil: </span>
              {entry.errorMessage}
            </div>
          )}
          {entry.confidenceScore !== null && (
            <div className="mb-2">
              <span className="font-semibold">Confidence: </span>{entry.confidenceScore}%
            </div>
          )}
          <pre className="whitespace-pre-wrap">{JSON.stringify(entry.details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
