"use client";

import { T, S } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { getPhaseMetrics, getCostSummary } from "@/lib/api";
import { getTaskStats } from "@/lib/api";
import { getMemoryStats } from "@/lib/api/memory";

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "transparent",
      border: `1px solid ${T.border}`,
      borderRadius: T.r,
      padding: "18px 20px",
    }}>
      <div style={{ fontSize: 10, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color: color || T.text, fontFamily: T.sans, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: T.textFaint, marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}

const PHASE_COLORS: Record<string, string> = {
  planning:  "#8ab4f8",
  coding:    "#81c995",
  reviewing: "#fdd663",
  building:  "#ff8bcb",
  diagnosis: "#f28b82",
  confidence:"#c58af9",
};

function phaseColor(phase: string): string {
  const lower = phase.toLowerCase();
  for (const [k, c] of Object.entries(PHASE_COLORS)) {
    if (lower.includes(k)) return c;
  }
  return T.textMuted;
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
  const dailyCost = Number(costData?.today?.total ?? 0) || (totalCost7d > 0 ? totalCost7d / 7 : 0);

  // Model breakdown from chat cost API
  const perModel: Array<{ model: string; total: number; tokens: number; count: number }> = costData?.perModel ?? [];
  const totalModelCost = perModel.reduce((s, m) => s + (m.total || 0), 0);

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

      {/* Secondary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S.md }}>
        <StatBox label="Oppgaver totalt" value={totalTasks} />
        <StatBox label="Minner totalt" value={totalMemories} />
        <StatBox label="Tokens (7d)" value={totalTokens7d.toLocaleString()} sub="Input + output" />
      </div>

      {/* Phase breakdown */}
      {phases.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: S.md }}>
            Forbruk per fase
          </div>
          <div style={{
            background: T.tabWrapper,
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            overflow: "hidden",
          }}>
            {phases.filter((p: any) => (p.totalCalls || 0) > 0 || (p.totalCostUsd || 0) > 0).map((p: any, i: number, arr: any[]) => {
              const color = phaseColor(p.phase);
              const tokens = (p.totalTokensInput || 0) + (p.totalTokensOutput || 0);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none",
                  }}
                >
                  {/* Phase color dot */}
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />

                  {/* Phase name */}
                  <span style={{ color: T.text, fontWeight: 500, fontSize: 13, flex: 1, minWidth: 0 }}>{p.phase}</span>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: S.lg, color: T.textMuted, fontSize: 12, fontFamily: T.mono, flexShrink: 0 }}>
                    <span>{p.totalCalls || 0} kall</span>
                    <span>{tokens.toLocaleString()} tok</span>
                    <span style={{ color, fontWeight: 600 }}>${(p.totalCostUsd || 0).toFixed(4)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model breakdown */}
      {perModel.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: S.md }}>
            Forbruk per modell
          </div>
          <div style={{
            background: T.tabWrapper,
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            overflow: "hidden",
          }}>
            {perModel
              .sort((a, b) => b.total - a.total)
              .map((m, i) => {
                const pct = totalModelCost > 0 ? (m.total / totalModelCost) * 100 : 0;
                const shortName = m.model.replace(/^claude-/, "").replace(/^gpt-/, "gpt-").replace(/-\d{8,}$/, "");
                return (
                  <div
                    key={i}
                    style={{
                      padding: "12px 16px",
                      borderBottom: i < perModel.length - 1 ? `1px solid ${T.border}` : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                      {/* Model name */}
                      <span style={{ fontSize: 12, fontFamily: T.mono, color: T.text, flex: 1 }}>{shortName}</span>

                      {/* Stats */}
                      <div style={{ display: "flex", gap: S.md, fontSize: 11, fontFamily: T.mono, color: T.textMuted, flexShrink: 0 }}>
                        <span>{m.count} kall</span>
                        <span>{(m.tokens || 0).toLocaleString()} tok</span>
                        <span style={{ color: T.text, fontWeight: 600 }}>${(m.total || 0).toFixed(4)}</span>
                        <span style={{ color: T.textFaint }}>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    {/* Usage bar */}
                    <div style={{ height: 3, borderRadius: 2, background: T.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: T.textMuted, borderRadius: 2, transition: "width 0.4s" }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
