"use client";

import { useState, useEffect } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import PixelCorners from "@/components/PixelCorners";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { listProviders, getCostSummary, getPhaseMetrics, type DailyTrend } from "@/lib/api";

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
  completing: "Fullføring",
};

const DAY_NAMES: Record<string, string> = {
  Mon: "Man",
  Tue: "Tir",
  Wed: "Ons",
  Thu: "Tor",
  Fri: "Fre",
  Sat: "Lør",
  Sun: "Søn",
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

const PROVIDER_CONFIG: Record<string, { displayName: string; color: string }> = {
  anthropic:  { displayName: "Anthropic",    color: "#D4A27F" },
  fireworks:  { displayName: "Fireworks.ai", color: "#FF6B35" },
  openrouter: { displayName: "OpenRouter",   color: "#6366F1" },
};

const PROVIDER_KEYS = ["anthropic", "fireworks", "openrouter"] as const;

const PHASES = [
  { key: "planning", label: "Planlegging", desc: "Oppgaveplanlegging og taskdeling" },
  { key: "coding",   label: "Programmering", desc: "Kodegenerering i builder" },
  { key: "reviewing", label: "Review", desc: "Kode-review og kvalitetssjekk" },
  { key: "chat",     label: "Chat", desc: "Direkte samtale" },
];

function matchProviderKey(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("anthropic")) return "anthropic";
  if (lower.includes("fireworks")) return "fireworks";
  if (lower.includes("openrouter")) return "openrouter";
  return null;
}

export default function AIPage() {
  const { data: providerData, loading: loadingProviders } = useApiData(() => listProviders(), []);
  const { data: costData, loading: loadingCost } = useApiData(() => getCostSummary(), []);
  const { data: phaseData, loading: loadingPhases } = useApiData(() => getPhaseMetrics(7), []);

  const loading = loadingProviders || loadingCost || loadingPhases;

  const providers = providerData?.providers ?? [];
  const dailyTrend = costData?.dailyTrend ?? [];
  const phases = phaseData?.phases ?? [];

  // Map backend providers to our 3
  const providerMap: Record<string, typeof providers[0] | null> = {
    anthropic: null,
    fireworks: null,
    openrouter: null,
  };
  for (const p of providers) {
    const key = matchProviderKey(p.name);
    if (key) providerMap[key] = p;
  }

  // Flatten models from matched providers only
  const matchedProviders = PROVIDER_KEYS.map((k) => providerMap[k]).filter(Boolean) as typeof providers;
  const allModels = matchedProviders.flatMap((p) =>
    (p.models ?? []).map((m) => ({ ...m, providerName: p.name }))
  );

  // Phase assignment from localStorage
  const [phaseModels, setPhaseModels] = useState<Record<string, string>>({});
  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const ph of PHASES) {
      const stored = localStorage.getItem(`tf_phase_${ph.key}`);
      if (stored) loaded[ph.key] = stored;
    }
    setPhaseModels(loaded);
  }, []);

  const activeModels = allModels.filter((m) => m.enabled);
  const cyclePhaseModel = (phaseKey: string) => {
    if (activeModels.length === 0) return;
    const current = phaseModels[phaseKey] || "";
    const currentIdx = activeModels.findIndex((m) => m.displayName === current);
    const nextIdx = (currentIdx + 1) % activeModels.length;
    const next = activeModels[nextIdx].displayName;
    setPhaseModels((prev) => ({ ...prev, [phaseKey]: next }));
    localStorage.setItem(`tf_phase_${phaseKey}`, next);
  };

  // Cost chart calculations
  const mx = dailyTrend.length > 0 ? Math.max(...dailyTrend.map((c: DailyTrend) => Number(c.total) || 0), 0.01) : 1;
  const weekTotal = Number(costData?.thisWeek?.total ?? 0) || 0;
  const avgPerDay = dailyTrend.length > 0 ? weekTotal / dailyTrend.length : 0;

  // Trend calc: compare last 3 days avg to first 3 days avg
  let trendPct = 0;
  if (dailyTrend.length >= 4) {
    const first = dailyTrend.slice(0, 3).reduce((s: number, d: DailyTrend) => s + (Number(d.total) || 0), 0) / 3;
    const last = dailyTrend.slice(-3).reduce((s: number, d: DailyTrend) => s + (Number(d.total) || 0), 0) / 3;
    if (first > 0) trendPct = Math.round(((last - first) / first) * 100);
  }

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
        <Skeleton rows={4} />
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
            marginBottom: 8,
          }}
        >
          AI
        </h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>
          Providers, modeller, kostnader og saldo.
        </p>
      </div>

      {/* Provider stats — always 3 columns */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <PixelCorners />
          {PROVIDER_KEYS.map((key, i) => {
            const config = PROVIDER_CONFIG[key];
            const backendProvider = providerMap[key];
            const enabledModels = backendProvider?.models?.filter((m) => m.enabled).length ?? 0;
            const isConnected = !!backendProvider;
            return (
              <div
                key={key}
                style={{
                  padding: "18px 20px",
                  borderRight: i < 2 ? `1px solid ${T.border}` : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: config.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {config.displayName.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: T.text,
                      }}
                    >
                      {config.displayName}
                    </span>
                  </div>
                  <Tag variant={isConnected ? "success" : "default"}>
                    {isConnected ? "Tilkoblet" : "Frakoblet"}
                  </Tag>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: T.mono,
                    color: T.textMuted,
                  }}
                >
                  {enabledModels} modeller aktive
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
                  Ingen data ennå
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

      {/* Models table — only from matched providers */}
      <GR>
        <div
          style={{
            border: `1px solid ${T.border}`,
            borderTop: "none",
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
                {m.tier >= 3 && <Tag variant="accent">primær</Tag>}
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

      {/* Phase assignment */}
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
            <SectionLabel>FASE-TILORDNING</SectionLabel>
          </div>
          {PHASES.map((ph, i) => {
            const selected = phaseModels[ph.key] || (activeModels.length > 0 ? activeModels[0].displayName : "Ingen");
            return (
              <div
                key={ph.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: i < PHASES.length - 1 ? `1px solid ${T.border}` : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{ph.label}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{ph.desc}</div>
                </div>
                <div
                  onClick={() => cyclePhaseModel(ph.key)}
                  style={{
                    padding: "6px 14px",
                    background: T.subtle,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: T.mono,
                    color: T.textSec,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {selected}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2.5 4L5 6.5 7.5 4"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </GR>
    </>
  );
}
