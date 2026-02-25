"use client";

import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import PixelCorners from "@/components/PixelCorners";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import { useApiData } from "@/lib/hooks";
import { listProviders, getCostSummary, getPhaseMetrics } from "@/lib/api";

const TOKEN_BUDGETS: Record<string, number> = {
  planning: 8000,
  building: 50000,
  diagnosis: 4000,
  review: 8000,
};

const PHASE_LABELS: Record<string, string> = {
  planning: "Planlegging",
  building: "Koding",
  diagnosis: "Validering",
  review: "Review",
  confidence: "Confidence",
  completing: "Fullf\u00f8ring",
};

const DAY_NAMES: Record<string, string> = {
  Mon: "Man",
  Tue: "Tir",
  Wed: "Ons",
  Thu: "Tor",
  Fri: "Fre",
  Sat: "L\u00f8r",
  Sun: "S\u00f8n",
};

function formatDayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const eng = d.toLocaleDateString("en-US", { weekday: "short" });
    return DAY_NAMES[eng] ?? eng;
  } catch {
    return dateStr;
  }
}

export default function AIPage() {
  const { data: providerData, loading: loadingProviders } = useApiData(() => listProviders(), []);
  const { data: costData, loading: loadingCost } = useApiData(() => getCostSummary(), []);
  const { data: phaseData, loading: loadingPhases } = useApiData(() => getPhaseMetrics(7), []);

  const loading = loadingProviders || loadingCost || loadingPhases;

  const providers = providerData?.providers ?? [];
  const dailyTrend = costData?.dailyTrend ?? [];
  const phases = phaseData?.phases ?? [];

  // Cost chart calculations
  const mx = dailyTrend.length > 0 ? Math.max(...dailyTrend.map((c: any) => Number(c.total) || 0), 0.01) : 1;
  const weekTotal = Number(costData?.thisWeek?.total ?? 0) || 0;
  const weekCount = Number(costData?.thisWeek?.count ?? 0) || 0;
  const avgPerDay = dailyTrend.length > 0 ? weekTotal / dailyTrend.length : 0;

  // Trend calc: compare last 3 days avg to first 3 days avg
  let trendPct = 0;
  if (dailyTrend.length >= 4) {
    const first = dailyTrend.slice(0, 3).reduce((s: number, d: any) => s + (Number(d.total) || 0), 0) / 3;
    const last = dailyTrend.slice(-3).reduce((s: number, d: any) => s + (Number(d.total) || 0), 0) / 3;
    if (first > 0) trendPct = Math.round(((last - first) / first) * 100);
  }

  // Flatten models from providers
  const allModels = providers.flatMap((p) =>
    (p.models ?? []).map((m) => ({ ...m, providerName: p.name }))
  );

  // Phase metrics for token budget bars
  const phaseBars = Object.entries(TOKEN_BUDGETS).map(([key, max]) => {
    const pm = phases.find((p) => p.phase === key);
    const usage = pm ? Math.round(pm.avgTokensInput + pm.avgTokensOutput) : 0;
    return {
      label: PHASE_LABELS[key] ?? key,
      budgetLabel: max >= 1000 ? `${max / 1000}k` : String(max),
      usage,
      max,
    };
  });

  if (loading) {
    return (
      <div style={{ paddingTop: 40 }}>
        <div
          style={{
            fontSize: 13,
            color: T.textMuted,
            fontFamily: T.mono,
            padding: "40px 0",
            textAlign: "center",
          }}
        >
          Laster AI-data...
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: T.text,
            letterSpacing: "-0.03em",
            fontFamily: T.brandFont,
            marginBottom: 8,
          }}
        >
          AI
        </h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>
          Providers, modeller, kostnader og saldo.
        </p>
      </div>

      {/* Provider stats */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(providers.length, 4)}, 1fr)`,
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <PixelCorners />
          {providers.slice(0, 4).map((p, i) => {
            const modelCount = p.models?.length ?? 0;
            const enabledModels = p.models?.filter((m) => m.enabled).length ?? 0;
            const usagePct = modelCount > 0 ? Math.round((enabledModels / modelCount) * 100) : 0;
            return (
              <div
                key={p.id}
                style={{
                  padding: "18px 20px",
                  borderRight: i < Math.min(providers.length, 4) - 1 ? `1px solid ${T.border}` : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: T.text,
                      fontFamily: T.brandFont,
                    }}
                  >
                    {p.name}
                  </span>
                  <Tag variant={p.enabled ? "accent" : "default"}>
                    {p.enabled ? "active" : "inactive"}
                  </Tag>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: T.textMuted,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  MODELLER
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: T.text, marginBottom: 8 }}>
                  {enabledModels}/{modelCount}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: T.subtle, overflow: "hidden" }}>
                    <div
                      style={{ width: `${usagePct}%`, height: "100%", background: T.accent }}
                    />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    {usagePct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </GR>

      {/* Cost chart + Token budget */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            border: `1px solid ${T.border}`,
            borderTop: "none",
            borderRadius: `0 0 ${T.r}px ${T.r}px`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <PixelCorners />
          <div style={{ padding: 20, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>KOSTNAD 7 DAGER</SectionLabel>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                height: 120,
                paddingTop: 8,
              }}
            >
              {dailyTrend.length > 0 ? (
                dailyTrend.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 9, fontFamily: T.mono, color: T.textFaint }}>
                      ${(Number(c.total) || 0).toFixed(2)}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        background: T.accent,
                        height: `${((Number(c.total) || 0) / mx) * 80}px`,
                        opacity: 0.8 + ((Number(c.total) || 0) / mx) * 0.2,
                      }}
                    />
                    <span style={{ fontSize: 9, fontFamily: T.mono, color: T.textFaint }}>
                      {formatDayLabel(c.date)}
                    </span>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: T.textMuted,
                  }}
                >
                  Ingen data enn\u00e5
                </div>
              )}
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "space-between",
                borderTop: `1px solid ${T.border}`,
                paddingTop: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: T.textMuted }}>TOTALT</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: T.text }}>
                  ${Number(weekTotal).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted }}>SNITT/DAG</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: T.text }}>
                  ${Number(avgPerDay).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted }}>TREND</div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: trendPct <= 0 ? T.success : T.error,
                  }}
                >
                  {trendPct <= 0 ? "" : "+"}{trendPct}%
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <SectionLabel>TOKEN-BUDSJETT PER FASE</SectionLabel>
            {phaseBars.map((p, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12, color: T.textSec }}>{p.label}</span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    {p.usage.toLocaleString()}/{p.budgetLabel}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: T.subtle,
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min((p.usage / p.max) * 100, 100)}%`,
                      height: "100%",
                      background: p.usage / p.max > 0.8 ? T.error : T.accent,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </GR>

      {/* Models table */}
      <GR mb={40}>
        <div
          style={{
            border: `1px solid ${T.border}`,
            borderTop: "none",
            borderRadius: `0 0 ${T.r}px ${T.r}px`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <PixelCorners />
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <SectionLabel>MODELLER</SectionLabel>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1fr 80px",
              padding: "10px 20px",
              borderBottom: `1px solid ${T.border}`,
              background: T.subtle,
            }}
          >
            {["MODELL", "PROVIDER", "PRIS", "TAGS", "STATUS", ""].map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: T.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: T.mono,
                }}
              >
                {h}
              </div>
            ))}
          </div>
          {allModels.length === 0 && (
            <div
              style={{
                padding: "24px 20px",
                fontSize: 12,
                color: T.textMuted,
                textAlign: "center",
              }}
            >
              Ingen modeller funnet
            </div>
          )}
          {allModels.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1fr 80px",
                padding: "12px 20px",
                borderBottom: i < allModels.length - 1 ? `1px solid ${T.border}` : "none",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: T.text,
                    fontFamily: T.mono,
                  }}
                >
                  {m.displayName}
                </span>
                {m.tier >= 3 && <Tag variant="accent">prim\u00e6r</Tag>}
              </div>
              <span style={{ fontSize: 12, color: T.textSec }}>{m.providerName}</span>
              <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textMuted }}>
                ${m.inputPrice}/${m.outputPrice}
              </span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(m.tags ?? []).slice(0, 2).map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: m.enabled ? T.success : T.textMuted,
                }}
              >
                {m.enabled ? "aktiv" : "av"}
              </span>
              <Btn sm>Endre</Btn>
            </div>
          ))}
        </div>
      </GR>
    </>
  );
}
