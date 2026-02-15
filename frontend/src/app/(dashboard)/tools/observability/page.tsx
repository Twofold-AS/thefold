"use client";

import { useState, useEffect } from "react";
import { getMonitorHealth, getAuditStats, listAuditLog, type AuditLogEntry } from "@/lib/api";

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pass: { bg: "#22c55e20", color: "#22c55e", label: "OK" },
  warn: { bg: "#eab30820", color: "#eab308", label: "Advarsel" },
  fail: { bg: "#ef444420", color: "#ef4444", label: "Feil" },
};

const CHECK_LABELS: Record<string, string> = {
  dependency_audit: "Avhengigheter",
  test_coverage: "Testdekning",
  code_quality: "Kodekvalitet",
  doc_freshness: "Dokumentasjon",
};

export default function ObservabilityPage() {
  const [health, setHealth] = useState<Record<string, Array<{
    repo: string;
    checkType: string;
    status: "pass" | "warn" | "fail";
    details: Record<string, unknown>;
  }>>>({});
  const [auditStats, setAuditStats] = useState<{
    totalEntries: number;
    totalTasks: number;
    successRate: number;
    averageDurationMs: number;
    actionTypeCounts: Record<string, number>;
    recentFailures: AuditLogEntry[];
  } | null>(null);
  const [recentErrors, setRecentErrors] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [healthRes, statsRes, errorsRes] = await Promise.all([
          getMonitorHealth(),
          getAuditStats(),
          listAuditLog({ failedOnly: true, limit: 10 }),
        ]);
        setHealth(healthRes.repos);
        setAuditStats(statsRes);
        setRecentErrors(errorsRes.entries);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="text-sm" style={{ color: "var(--text-muted)" }}>Laster...</div>;
  }

  const repoNames = Object.keys(health);

  return (
    <div className="space-y-6">
      {/* Cost / performance stats */}
      {auditStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Totalt handlinger</div>
            <div className="text-2xl font-mono font-medium" style={{ color: "var(--text-primary)" }}>
              {auditStats.totalEntries}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Oppgaver</div>
            <div className="text-2xl font-mono font-medium" style={{ color: "var(--text-primary)" }}>
              {auditStats.totalTasks}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Suksessrate</div>
            <div className="text-2xl font-mono font-medium" style={{
              color: auditStats.successRate > 80 ? "#22c55e" : auditStats.successRate > 50 ? "#eab308" : "#ef4444"
            }}>
              {auditStats.successRate.toFixed(0)}%
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Snitt varighet</div>
            <div className="text-2xl font-mono font-medium" style={{ color: "var(--text-primary)" }}>
              {auditStats.averageDurationMs > 0
                ? `${(auditStats.averageDurationMs / 1000).toFixed(1)}s`
                : "\u2014"}
            </div>
          </div>
        </div>
      )}

      {/* Health dashboard */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-sans font-medium" style={{ color: "var(--text-primary)" }}>
            Repo-helse
          </h3>
        </div>
        {repoNames.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Ingen helsesjekker kj&oslash;rt enn&aring;
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {repoNames.map((repoName) => {
              const checks = health[repoName];
              const worstStatus = checks.reduce((worst, c) => {
                if (c.status === "fail") return "fail";
                if (c.status === "warn" && worst !== "fail") return "warn";
                return worst;
              }, "pass" as "pass" | "warn" | "fail");
              const style = STATUS_STYLES[worstStatus];

              return (
                <div key={repoName} className="px-5 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                      {repoName}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {style.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {checks.map((check) => {
                      const checkStyle = STATUS_STYLES[check.status];
                      return (
                        <span
                          key={check.checkType}
                          className="text-[10px] px-2 py-1 rounded"
                          style={{ background: checkStyle.bg, color: checkStyle.color }}
                        >
                          {CHECK_LABELS[check.checkType] || check.checkType}: {checkStyle.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action type breakdown */}
      {auditStats && Object.keys(auditStats.actionTypeCounts).length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-sans font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            Handlingstyper
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(auditStats.actionTypeCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div key={type} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: "var(--bg-secondary)" }}>
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{type}</span>
                  <span className="text-xs font-mono font-medium" style={{ color: "var(--text-primary)" }}>{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent errors */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-sans font-medium" style={{ color: "var(--text-primary)" }}>
            Siste feil
          </h3>
        </div>
        {recentErrors.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Ingen feil registrert
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {recentErrors.map((entry) => (
              <div key={entry.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                    {entry.actionType}
                  </span>
                  {entry.taskId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                      {entry.taskId}
                    </span>
                  )}
                  <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                    {new Date(entry.timestamp).toLocaleString("nb-NO")}
                  </span>
                </div>
                {entry.errorMessage && (
                  <p className="text-xs mt-1" style={{ color: "#ef4444" }}>
                    {entry.errorMessage.length > 200 ? entry.errorMessage.substring(0, 200) + "..." : entry.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
