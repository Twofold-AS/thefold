"use client";

import { useState, useEffect, useRef } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { listProviders, getCostSummary, getPhaseMetrics, saveModel, type DailyTrend } from "@/lib/api";
import { Plus, ChevronDown, Check, X } from "lucide-react";

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

const PROVIDER_CONFIG: Record<string, { displayName: string; color: string; logo: string }> = {
  anthropic:  { displayName: "Anthropic",    color: "#D4A27F", logo: "/logos/anthropic.svg" },
  fireworks:  { displayName: "Fireworks.ai", color: "#FF6B35", logo: "/logos/fireworks.svg" },
  openrouter: { displayName: "OpenRouter",   color: "#6366F1", logo: "/logos/openrouter.svg" },
};

const PROVIDER_KEYS = ["anthropic", "fireworks", "openrouter"] as const;

const PHASES = [
  { key: "planning", label: "Planlegging", desc: "Oppgaveplanlegging og taskdeling" },
  { key: "coding",   label: "Programmering", desc: "Kodegenerering i builder" },
  { key: "reviewing", label: "Review", desc: "Kode-review og kvalitetssjekk" },
  { key: "chat",     label: "Chat", desc: "Direkte samtale" },
];

const AVAILABLE_TAGS = ["coding", "chat", "planning", "review", "analysis"];

const inputStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 13,
  color: T.text,
  fontFamily: T.sans,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

function matchProviderKey(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("anthropic")) return "anthropic";
  if (lower.includes("fireworks")) return "fireworks";
  if (lower.includes("openrouter")) return "openrouter";
  return null;
}

function ProviderLogo({ providerKey, size = 30 }: { providerKey: string; size?: number }) {
  const config = PROVIDER_CONFIG[providerKey];
  const [imgError, setImgError] = useState(false);

  if (!config) return null;

  if (imgError) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: config.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.47,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {config.displayName.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={config.logo}
      alt={config.displayName}
      width={size}
      height={size}
      style={{ borderRadius: "50%", flexShrink: 0 }}
      onError={() => setImgError(true)}
    />
  );
}

export default function AIPage() {
  const { data: providerData, loading: loadingProviders, refresh: refreshProviders } = useApiData(async () => {
    try { return await listProviders(); }
    catch { await new Promise(r => setTimeout(r, 2000)); return await listProviders(); }
  }, []);
  const { data: costData, loading: loadingCost } = useApiData(async () => {
    try { return await getCostSummary(); }
    catch { await new Promise(r => setTimeout(r, 2000)); return await getCostSummary(); }
  }, []);
  const { data: phaseData, loading: loadingPhases } = useApiData(async () => {
    try { return await getPhaseMetrics(7); }
    catch { await new Promise(r => setTimeout(r, 2000)); return await getPhaseMetrics(7); }
  }, []);

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
    (p.models ?? []).map((m) => ({ ...m, providerName: p.name, providerId: p.id }))
  );

  // Phase assignment from localStorage — stores model IDs (multi-select)
  const [phaseModels, setPhaseModels] = useState<Record<string, string[]>>({});
  const [openPhaseDropdown, setOpenPhaseDropdown] = useState<string | null>(null);
  const phaseDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded: Record<string, string[]> = {};
    for (const ph of PHASES) {
      const stored = localStorage.getItem(`tf_phase_${ph.key}`);
      if (stored) {
        try {
          loaded[ph.key] = JSON.parse(stored);
        } catch {
          loaded[ph.key] = [stored];
        }
      }
    }
    setPhaseModels(loaded);
  }, []);

  // Close phase dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (phaseDropdownRef.current && !phaseDropdownRef.current.contains(e.target as Node)) {
        setOpenPhaseDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeModels = allModels.filter((m) => m.enabled);

  const togglePhaseModel = (phaseKey: string, modelId: string) => {
    setPhaseModels((prev) => {
      const current = prev[phaseKey] || [];
      const next = current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId];
      localStorage.setItem(`tf_phase_${phaseKey}`, JSON.stringify(next));
      return { ...prev, [phaseKey]: next };
    });
  };

  // "Legg til modell" modal state (C3)
  const [addModelProvider, setAddModelProvider] = useState<string | null>(null);
  const [newModel, setNewModel] = useState({ modelId: "", displayName: "", tier: 3, tags: [] as string[] });
  const [savingModel, setSavingModel] = useState(false);

  const handleSaveNewModel = async () => {
    if (!addModelProvider || !newModel.modelId || !newModel.displayName) return;
    const provider = providerMap[addModelProvider];
    if (!provider) return;
    setSavingModel(true);
    try {
      await saveModel({
        providerId: provider.id,
        modelId: newModel.modelId,
        displayName: newModel.displayName,
        inputPrice: 0,
        outputPrice: 0,
        contextWindow: 128000,
        tags: newModel.tags,
        tier: newModel.tier,
        enabled: true,
      });
      setAddModelProvider(null);
      setNewModel({ modelId: "", displayName: "", tier: 3, tags: [] });
      refreshProviders();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setSavingModel(false);
    }
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

  const getPhaseModelLabels = (phaseKey: string): string => {
    const ids = phaseModels[phaseKey] || [];
    if (ids.length === 0) return "Auto (anbefalt)";
    return ids
      .map((id) => {
        const m = activeModels.find((am) => am.id === id);
        return m ? m.displayName : id;
      })
      .join(", ");
  };

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

      {/* Provider stats — always 3 columns (C7: logos) */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
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
                  <ProviderLogo providerKey={key} size={30} />
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
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: T.mono,
                      color: T.textMuted,
                    }}
                  >
                    {enabledModels} modeller aktive
                  </span>
                  {/* C3: "Legg til modell" per provider */}
                  {isConnected && (
                    <Btn sm onClick={() => setAddModelProvider(key)} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Plus size={12} /> Legg til
                    </Btn>
                  )}
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
            marginTop: 20,
            position: "relative",
            overflow: "hidden",
          }}
        >
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

      {/* C5: Phase assignment BEFORE models table */}
      <GR>
        <div
          style={{
            marginTop: 20,
            position: "relative",
            overflow: "visible",
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <SectionLabel>FASE-TILORDNING</SectionLabel>
          </div>
          {PHASES.map((ph, i) => {
            const selectedIds = phaseModels[ph.key] || [];
            const isOpen = openPhaseDropdown === ph.key;
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
                {/* C4: Proper dropdown with multi-select */}
                <div style={{ position: "relative" }} ref={isOpen ? phaseDropdownRef : undefined}>
                  <div
                    onClick={() => setOpenPhaseDropdown(isOpen ? null : ph.key)}
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
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getPhaseModelLabels(ph.key)}
                    <ChevronDown size={12} />
                  </div>
                  {isOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 4,
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        minWidth: 260,
                        zIndex: 50,
                        maxHeight: 240,
                        overflowY: "auto",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      {/* Auto option */}
                      <div
                        onClick={() => {
                          setPhaseModels((prev) => ({ ...prev, [ph.key]: [] }));
                          localStorage.setItem(`tf_phase_${ph.key}`, JSON.stringify([]));
                        }}
                        style={{
                          padding: "8px 12px",
                          fontSize: 12,
                          color: selectedIds.length === 0 ? T.text : T.textMuted,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          borderBottom: `1px solid ${T.border}`,
                          background: selectedIds.length === 0 ? T.subtle : "transparent",
                        }}
                      >
                        {selectedIds.length === 0 && <Check size={12} />}
                        <span>Auto (anbefalt)</span>
                      </div>
                      {/* Group by provider */}
                      {PROVIDER_KEYS.map((pk) => {
                        const providerModels = activeModels.filter((m) => matchProviderKey(m.providerName) === pk);
                        if (providerModels.length === 0) return null;
                        return (
                          <div key={pk}>
                            <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {PROVIDER_CONFIG[pk]?.displayName ?? pk}
                            </div>
                            {providerModels.map((m) => {
                              const isSelected = selectedIds.includes(m.id);
                              return (
                                <div
                                  key={m.id}
                                  onClick={() => togglePhaseModel(ph.key, m.id)}
                                  style={{
                                    padding: "8px 12px",
                                    fontSize: 12,
                                    fontFamily: T.mono,
                                    color: isSelected ? T.text : T.textMuted,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    background: isSelected ? T.subtle : "transparent",
                                  }}
                                >
                                  {isSelected ? <Check size={12} /> : <div style={{ width: 12 }} />}
                                  {m.displayName}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GR>

      {/* Models table — C6: removed "Endre" column */}
      <GR mb={40}>
        <div
          style={{
            marginTop: 20,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
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
              gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1fr",
              padding: "10px 20px",
              borderBottom: `1px solid ${T.border}`,
              background: T.subtle,
            }}
          >
            {["MODELL", "PROVIDER", "PRIS", "TAGS", "STATUS"].map((h, i) => (
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
                gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1fr",
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
            </div>
          ))}
        </div>
      </GR>

      {/* C3: "Legg til modell" modal */}
      {addModelProvider && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setAddModelProvider(null); }}
        >
          <div
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 24,
              width: 420,
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>
                Legg til modell — {PROVIDER_CONFIG[addModelProvider]?.displayName}
              </div>
              <X size={16} style={{ cursor: "pointer", color: T.textMuted }} onClick={() => setAddModelProvider(null)} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Modell-ID</div>
              <input
                value={newModel.modelId}
                onChange={(e) => setNewModel((prev) => ({ ...prev, modelId: e.target.value }))}
                placeholder="f.eks. moonshotai/moonshot-v1-128k"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Visningsnavn</div>
              <input
                value={newModel.displayName}
                onChange={(e) => setNewModel((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="f.eks. Moonshot v1 128k"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Tags</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {AVAILABLE_TAGS.map((tag) => {
                  const selected = newModel.tags.includes(tag);
                  return (
                    <div
                      key={tag}
                      onClick={() => {
                        setNewModel((prev) => ({
                          ...prev,
                          tags: selected ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
                        }));
                      }}
                      style={{
                        padding: "4px 10px",
                        fontSize: 11,
                        fontFamily: T.mono,
                        background: selected ? T.subtle : "transparent",
                        color: selected ? T.text : T.textMuted,
                        border: `1px solid ${selected ? T.border : "transparent"}`,
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      {tag}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <Btn sm onClick={() => setAddModelProvider(null)}>Avbryt</Btn>
              <Btn
                primary
                sm
                onClick={handleSaveNewModel}
                style={{ opacity: savingModel ? 0.5 : 1, pointerEvents: savingModel ? "none" : "auto" }}
              >
                {savingModel ? "Lagrer..." : "Lagre"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
