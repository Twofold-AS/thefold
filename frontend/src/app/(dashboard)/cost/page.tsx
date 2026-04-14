"use client";

import { T, S } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { getPhaseMetrics, getCostSummary } from "@/lib/api";
import { getTaskStats } from "@/lib/api";
import { getMemoryStats } from "@/lib/api/memory";
// No back button — accessed from topbar icon

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: T.r,
      padding: "20px 24px",
    }}>
      <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: color || T.text, fontFamily: T.sans }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: T.textFaint, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

export default function CostPage() {
  const { data: phaseData } = useApiData(() => getPhaseMetrics(7), []);
  const { data: costData } = useApiData(() => getCostSummary(), []);
  const { data: taskStats } = useApiData(() => getTaskStats(), []);
  const { data: memStats } = useApiData(() => getMemoryStats(), []);

  const phases = phaseData?.phases ?? [];
  const totalCost7d = phases.reduce((s: number, p: any) => s + (p.totalCostUsd || 0), 0);
  const totalTokens7d = phases.reduce((s: number, p: any) => s + (p.totalTokensInput || 0) + (p.totalTokensOutput || 0), 0);

  const totalTasks = taskStats?.total ?? 0;
  const doneTasks = taskStats?.byStatus?.done ?? 0;
  const failedTasks = taskStats?.byStatus?.failed ?? 0;
  const successRate = totalTasks > 0 ? ((doneTasks / totalTasks) * 100).toFixed(0) : "—";

  const totalMemories = memStats?.total ?? 0;

  const dailyCost = costData?.dailyCostUsd ?? (totalCost7d / 7);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.xl, paddingTop: 0, paddingBottom: S.xxl }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, margin: 0 }}>Kostnadsoversikt</h1>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
          Forbruk, tokens og ytelse siste 7 dager
        </p>
      </div>

      {/* Main stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S.md }}>
        <StatBox
          label="Daglig kostnad"
          value={`$${dailyCost.toFixed(4)}`}
          sub="Gjennomsnitt siste 7 dager"
          color={T.warning}
        />
        <StatBox
          label="Total kostnad (7d)"
          value={`$${totalCost7d.toFixed(4)}`}
          sub={`${totalTokens7d.toLocaleString()} tokens`}
        />
        <StatBox
          label="Success rate"
          value={`${successRate}%`}
          sub={`${doneTasks} fullført, ${failedTasks} feilet`}
          color={T.success}
        />
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S.md }}>
        <StatBox label="Oppgaver totalt" value={totalTasks} />
        <StatBox label="Minner totalt" value={totalMemories} />
        <StatBox
          label="Tokens (7d)"
          value={totalTokens7d.toLocaleString()}
          sub="Input + output"
        />
      </div>

      {/* Phase breakdown */}
      {phases.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text, marginBottom: S.md }}>
            Forbruk per fase (siste 7 dager)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {phases.map((p: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 16px",
                  border: `1px solid ${T.border}`,
                  borderRadius: 0,
                  fontSize: 13,
                }}
              >
                <span style={{ color: T.text, fontWeight: 500 }}>{p.phase}</span>
                <div style={{ display: "flex", gap: S.lg, color: T.textMuted, fontSize: 12, fontFamily: T.mono }}>
                  <span>{p.totalCalls || 0} kall</span>
                  <span>{((p.totalTokensInput || 0) + (p.totalTokensOutput || 0)).toLocaleString()} tok</span>
                  <span style={{ color: T.accent }}>${(p.totalCostUsd || 0).toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
