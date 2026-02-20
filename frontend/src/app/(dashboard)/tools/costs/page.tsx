"use client";

import { useEffect, useState } from "react";
import {
  getPhaseMetrics,
  getTaskMetrics,
  type PhaseMetricsSummary,
  type TaskCostBreakdown,
} from "@/lib/api";

const DAYS_OPTIONS = [
  { label: "1 dag", value: 1 },
  { label: "7 dager", value: 7 },
  { label: "30 dager", value: 30 },
];

function fmtCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function CostsDashboardPage() {
  const [days, setDays] = useState(7);
  const [phases, setPhases] = useState<PhaseMetricsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState("");
  const [breakdown, setBreakdown] = useState<TaskCostBreakdown | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    setLoading(true);
    getPhaseMetrics(days)
      .then((r) => setPhases(r.phases))
      .catch(() => setPhases([]))
      .finally(() => setLoading(false));
  }, [days]);

  const totalCost = phases.reduce((s, p) => s + p.totalCostUsd, 0);
  const totalAiCalls = phases.reduce((s, p) => s + p.totalAiCalls, 0);
  const taskCount = phases.reduce((s, p) => Math.max(s, p.taskCount), 0);
  const mostExpensive = phases[0];
  const avgPerTask = taskCount > 0 ? totalCost / taskCount : 0;

  async function handleLookup() {
    if (!taskId.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    setBreakdown(null);
    try {
      const r = await getTaskMetrics(taskId.trim());
      setBreakdown(r.breakdown);
      if (!r.breakdown) setLookupError("Ingen metrics funnet for denne task-IDen.");
    } catch {
      setLookupError("Kunne ikke hente metrics. Sjekk at task-IDen er korrekt.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Period selector */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {DAYS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            className={days === opt.value ? "tab tab-active" : "tab"}
            style={{ fontSize: 13 }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, border: "1px solid var(--border)", marginBottom: 32 }}>
          {[
            { label: `Total kostnad (${days}d)`, value: fmtCost(totalCost) },
            { label: "Snitt per task", value: fmtCost(avgPerTask) },
            {
              label: "Dyreste fase",
              value: mostExpensive ? `${mostExpensive.phase} (${fmtCost(mostExpensive.totalCostUsd)})` : "—",
            },
            { label: "Totalt AI-kall", value: totalAiCalls.toLocaleString() },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                padding: "16px 20px",
                background: "var(--bg-card)",
                borderRight: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {card.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)" }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Per-phase table */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
          Kostnad per fase
        </div>
        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Laster...</div>
        ) : phases.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Ingen metrics for valgt periode. Start en task med AgentPersistentJobs=true for å samle data.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Fase", "Total kostnad", "Snitt kostnad", "p95 kostnad", "AI-kall", "Snitt varighet", "Tasks"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {phases.map((p) => (
                <tr
                  key={p.phase}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500 }}>{p.phase}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)" }}>{fmtCost(p.totalCostUsd)}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace)" }}>{fmtCost(p.avgCostUsd)}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace)" }}>{fmtCost(p.p95CostUsd)}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{p.totalAiCalls}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{fmtMs(p.avgDurationMs)}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{p.taskCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Task lookup */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
          Kostnadsdetaljer per task
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="Task-ID (UUID)"
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 13,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading || !taskId.trim()}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              background: "var(--text-primary)",
              color: "var(--bg-base)",
              border: "none",
              cursor: lookupLoading || !taskId.trim() ? "not-allowed" : "pointer",
              opacity: lookupLoading || !taskId.trim() ? 0.5 : 1,
            }}
          >
            {lookupLoading ? "Henter..." : "Hent detaljer"}
          </button>
        </div>

        {lookupError && (
          <div style={{ fontSize: 13, color: "var(--color-red, #e53e3e)", marginBottom: 12 }}>
            {lookupError}
          </div>
        )}

        {breakdown && (
          <div style={{ border: "1px solid var(--border)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Task: </span>
              <span style={{ fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)" }}>{breakdown.taskId}</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 16 }}>
                Total: <strong style={{ color: "var(--text-primary)" }}>{fmtCost(breakdown.totalCostUsd)}</strong>
                {" · "}
                {breakdown.totalTokens.toLocaleString()} tokens
                {" · "}
                {fmtMs(breakdown.totalDurationMs)}
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Fase", "Tokens inn", "Tokens ut", "Cached", "Kostnad", "Varighet", "Modell", "AI-kall"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                        color: "var(--text-muted)",
                        fontWeight: 500,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.phases.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500 }}>{p.phase}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{p.tokensInput.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{p.tokensOutput.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{p.cachedTokens.toLocaleString()}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)" }}>{fmtCost(p.costUsd)}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{fmtMs(p.durationMs)}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>{p.model || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{p.aiCalls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
