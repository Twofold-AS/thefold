"use client";

import { useEffect, useState } from "react";
import {
  listProviders,
  getCostSummary,
  getPhaseMetrics,
  getSecretsStatus,
  type AIProvider,
  type CostSummary,
  type PhaseMetricsSummary,
  type SecretStatus,
} from "@/lib/api";
import { GridSection } from "@/components/ui/corner-ornament";
import { ParticleField, EmberGlow } from "@/components/effects/ParticleField";
import {
  Cpu,
  DollarSign,
  Activity,
  Zap,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Key,
  BarChart3,
} from "lucide-react";

type AITab = "providers" | "costs" | "budget";

export default function AIPage() {
  const [activeTab, setActiveTab] = useState<AITab>("providers");
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [phases, setPhases] = useState<PhaseMetricsSummary[]>([]);
  const [secrets, setSecrets] = useState<SecretStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      listProviders().then((res) => setProviders(res.providers)),
      getCostSummary().then(setCosts),
      getPhaseMetrics(7).then((res) => setPhases(res.phases)),
      getSecretsStatus().then((res) => setSecrets(res.secrets)),
    ]).finally(() => setLoading(false));
  }, []);

  const totalModels = providers.reduce((sum, p) => sum + (p.models?.length || 0), 0);
  const enabledModels = providers.reduce(
    (sum, p) => sum + (p.models?.filter((m) => m.enabled).length || 0),
    0
  );
  const activeProviders = providers.filter((p) => p.enabled).length;

  // Map secrets to providers
  const providerSecretMap: Record<string, boolean> = {};
  secrets.forEach((s) => {
    if (s.name.toLowerCase().includes("anthropic")) providerSecretMap["Anthropic"] = s.configured;
    if (s.name.toLowerCase().includes("openai")) providerSecretMap["OpenAI"] = s.configured;
    if (s.name.toLowerCase().includes("openrouter")) providerSecretMap["OpenRouter"] = s.configured;
    if (s.name.toLowerCase().includes("fireworks")) providerSecretMap["Fireworks"] = s.configured;
  });

  const tabs: { key: AITab; label: string; icon: React.ReactNode }[] = [
    { key: "providers", label: "Providers", icon: <Cpu className="w-4 h-4" /> },
    { key: "costs", label: "Costs", icon: <DollarSign className="w-4 h-4" /> },
    { key: "budget", label: "Token Budget", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-full page-enter" style={{ background: "var(--tf-bg-base)" }}>
      {/* Header */}
      <GridSection showTop={false} className="px-6 pt-8 pb-6 relative overflow-hidden">
        <ParticleField count={8} className="opacity-30" />
        <EmberGlow />
        <div className="absolute top-4 right-6 opacity-20 hidden lg:block" style={{ color: "var(--tf-border-muted)" }}>
          <svg width="120" height="60" viewBox="0 0 120 60" fill="none">
            {Array.from({ length: 8 }).map((_, row) =>
              Array.from({ length: 16 }).map((_, col) => (
                <circle key={`${row}-${col}`} cx={col * 8 + 4} cy={row * 8 + 4} r="1" fill="currentColor" />
              ))
            )}
          </svg>
        </div>
        <div className="flex items-center gap-4 mb-1">
          <h1 className="text-display-lg" style={{ color: "var(--tf-text-primary)" }}>
            AI
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255, 107, 44, 0.08)", color: "var(--tf-heat)" }}>
              {activeProviders} active
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--tf-surface)", color: "var(--tf-text-muted)" }}>
              {enabledModels}/{totalModels} models
            </span>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
          Providers, models, and cost tracking
        </p>
      </GridSection>

      {/* Tabbed layout */}
      <GridSection className="min-h-[500px]">
        <div className="flex min-h-[500px]">
          {/* Left tab sidebar */}
          <div className="w-[200px] flex-shrink-0 p-4 hidden sm:block" style={{ borderRight: "1px solid var(--tf-border-faint)" }}>
            <div className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left"
                  style={{
                    background: activeTab === tab.key ? "rgba(255, 107, 44, 0.06)" : "transparent",
                    color: activeTab === tab.key ? "var(--tf-heat)" : "var(--tf-text-secondary)",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Quick stats */}
            {!loading && (
              <div className="mt-6 pt-4 border-t space-y-3" style={{ borderColor: "var(--tf-border-faint)" }}>
                <div>
                  <span className="text-[10px] uppercase tracking-wider block mb-1 px-4" style={{ color: "var(--tf-text-faint)" }}>
                    Today
                  </span>
                  <div className="px-4">
                    <span className="text-lg font-medium tabular-nums" style={{ color: "var(--tf-text-primary)" }}>
                      ${Number(costs?.today?.total ?? 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] block" style={{ color: "var(--tf-text-faint)" }}>
                      {Number(costs?.today?.tokens ?? 0).toLocaleString()} tokens
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider block mb-1 px-4" style={{ color: "var(--tf-text-faint)" }}>
                    This Month
                  </span>
                  <div className="px-4">
                    <span className="text-lg font-medium tabular-nums" style={{ color: "var(--tf-text-primary)" }}>
                      ${Number(costs?.thisMonth?.total ?? 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] block" style={{ color: "var(--tf-text-faint)" }}>
                      {Number(costs?.thisMonth?.tokens ?? 0).toLocaleString()} tokens
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b sm:hidden" style={{ borderColor: "var(--tf-border-faint)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
                style={{
                  background: activeTab === tab.key ? "rgba(255, 107, 44, 0.06)" : "transparent",
                  color: activeTab === tab.key ? "var(--tf-heat)" : "var(--tf-text-muted)",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 lg:p-8">
            {/* Providers tab */}
            {activeTab === "providers" && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Providers & Models
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    Configured AI providers and their available models
                  </p>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="skeleton h-16 rounded-lg" />
                    ))}
                  </div>
                ) : providers.length === 0 ? (
                  <div
                    className="text-center py-12 rounded-lg"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    <Cpu className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--tf-text-faint)" }} />
                    <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                      No providers configured
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {providers.map((provider) => (
                      <div
                        key={provider.id}
                        className="rounded-lg overflow-hidden"
                        style={{ border: "1px solid var(--tf-border-faint)" }}
                      >
                        <button
                          onClick={() =>
                            setExpandedProvider(expandedProvider === provider.id ? null : provider.id)
                          }
                          className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                background: provider.enabled ? "var(--tf-success)" : "var(--tf-text-faint)",
                              }}
                            />
                            <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                              {provider.name}
                            </span>
                            <span className="text-xs" style={{ color: "var(--tf-text-faint)" }}>
                              {provider.models?.filter((m) => m.enabled).length || 0} active models
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {provider.apiKeySet ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(66, 195, 102, 0.08)", color: "var(--tf-success)" }}>
                                <Key className="w-3 h-3" /> Configured
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(235, 52, 36, 0.08)", color: "var(--tf-error)" }}>
                                <Key className="w-3 h-3" /> Missing
                              </span>
                            )}
                            {expandedProvider === provider.id ? (
                              <ChevronUp className="w-4 h-4" style={{ color: "var(--tf-text-faint)" }} />
                            ) : (
                              <ChevronDown className="w-4 h-4" style={{ color: "var(--tf-text-faint)" }} />
                            )}
                          </div>
                        </button>

                        {expandedProvider === provider.id && provider.models && (
                          <div className="border-t" style={{ borderColor: "var(--tf-border-faint)" }}>
                            {provider.models.map((model) => (
                              <div
                                key={model.id}
                                className="flex items-center justify-between px-4 py-2.5 border-b last:border-b-0"
                                style={{ borderColor: "var(--tf-border-faint)" }}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {model.enabled ? (
                                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--tf-success)" }} />
                                  ) : (
                                    <X className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--tf-text-faint)" }} />
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-sm block truncate" style={{ color: "var(--tf-text-primary)" }}>
                                      {model.displayName}
                                    </span>
                                    <span className="text-[10px] font-mono" style={{ color: "var(--tf-text-faint)" }}>
                                      {model.modelId}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0">
                                  <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                                    Tier {model.tier}
                                  </span>
                                  <div className="text-right">
                                    <span className="text-[10px] block" style={{ color: "var(--tf-text-faint)" }}>
                                      ${model.inputPrice.toFixed(2)}/1M in
                                    </span>
                                    <span className="text-[10px] block" style={{ color: "var(--tf-text-faint)" }}>
                                      ${model.outputPrice.toFixed(2)}/1M out
                                    </span>
                                  </div>
                                  <div className="flex gap-1">
                                    {model.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="text-[9px] px-1 py-0.5 rounded"
                                        style={{ background: "var(--tf-surface)", color: "var(--tf-text-faint)" }}
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Costs tab */}
            {activeTab === "costs" && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Cost Overview
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    Spending trends and model usage
                  </p>
                </div>

                {/* Daily trend chart */}
                <div
                  className="rounded-lg p-5"
                  style={{ border: "1px solid var(--tf-border-faint)" }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4" style={{ color: "var(--tf-text-muted)" }} />
                      <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                        Last 7 days
                      </span>
                    </div>
                  </div>
                  {loading ? (
                    <div className="skeleton h-48 rounded" />
                  ) : (
                    <div className="h-48 flex items-end gap-1">
                      {(costs?.dailyTrend ?? Array(7).fill({ total: 0 })).slice(-7).map((day, i) => {
                        const max = Math.max(...(costs?.dailyTrend?.map((d) => d.total) ?? [1]), 0.01);
                        const height = Math.max(((day.total ?? 0) / max) * 100, 4);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--tf-text-faint)" }}>
                              ${(day.total ?? 0).toFixed(2)}
                            </span>
                            <div
                              className="w-full rounded-t transition-all"
                              style={{
                                height: `${height}%`,
                                background: "linear-gradient(to top, var(--tf-heat), rgba(255, 107, 44, 0.3))",
                                minHeight: "4px",
                              }}
                            />
                            <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
                              {day.date ? new Date(day.date).toLocaleDateString("en", { weekday: "short" }) : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top models by spend */}
                <div
                  className="rounded-lg p-5"
                  style={{ border: "1px solid var(--tf-border-faint)" }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-4 h-4" style={{ color: "var(--tf-text-muted)" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                      Top models by spend
                    </span>
                  </div>
                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => <div key={i} className="skeleton h-4 rounded" />)}
                    </div>
                  ) : costs?.perModel && costs.perModel.length > 0 ? (
                    <div className="space-y-3">
                      {costs.perModel.slice(0, 8).map((m) => {
                        const maxCost = Math.max(...costs.perModel!.map((x) => x.total), 0.001);
                        const width = (m.total / maxCost) * 100;
                        return (
                          <div key={m.model} className="flex items-center gap-3">
                            <span className="text-xs w-40 truncate text-right" style={{ color: "var(--tf-text-secondary)" }}>
                              {m.model}
                            </span>
                            <div className="flex-1 h-2 rounded-full" style={{ background: "var(--tf-border-faint)" }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.max(width, 2)}%`, background: "var(--tf-heat)" }}
                              />
                            </div>
                            <span className="text-xs font-mono w-16 text-right tabular-nums" style={{ color: "var(--tf-text-muted)" }}>
                              ${m.total.toFixed(3)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>No cost data yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Token Budget tab */}
            {activeTab === "budget" && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
                    Token Budget per Phase
                  </h2>
                  <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                    Average cost and token usage by agent phase
                  </p>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8 rounded" />)}
                  </div>
                ) : phases.length > 0 ? (
                  <div
                    className="rounded-lg divide-y overflow-hidden"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-2" style={{ background: "var(--tf-surface)" }}>
                      <span className="text-[10px] uppercase tracking-wider w-28" style={{ color: "var(--tf-text-faint)" }}>Phase</span>
                      <span className="text-[10px] uppercase tracking-wider flex-1" style={{ color: "var(--tf-text-faint)" }}>Usage</span>
                      <span className="text-[10px] uppercase tracking-wider w-20 text-right" style={{ color: "var(--tf-text-faint)" }}>Avg Cost</span>
                      <span className="text-[10px] uppercase tracking-wider w-20 text-right" style={{ color: "var(--tf-text-faint)" }}>Avg Tokens</span>
                    </div>
                    {phases.map((p) => {
                      const maxCost = Math.max(...phases.map((x) => x.avgCostUsd), 0.001);
                      const width = (p.avgCostUsd / maxCost) * 100;
                      return (
                        <div key={p.phase} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-xs w-28 truncate capitalize" style={{ color: "var(--tf-text-secondary)" }}>
                            {p.phase}
                          </span>
                          <div className="flex-1 h-2 rounded-full" style={{ background: "var(--tf-border-faint)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.max(width, 2)}%`, background: "var(--tf-heat)" }}
                            />
                          </div>
                          <span className="text-xs font-mono w-20 text-right tabular-nums" style={{ color: "var(--tf-text-muted)" }}>
                            ${p.avgCostUsd.toFixed(4)}
                          </span>
                          <span className="text-xs font-mono w-20 text-right tabular-nums" style={{ color: "var(--tf-text-faint)" }}>
                            {(p.avgTokensInput + p.avgTokensOutput).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className="text-center py-12 rounded-lg"
                    style={{ border: "1px solid var(--tf-border-faint)" }}
                  >
                    <BarChart3 className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--tf-text-faint)" }} />
                    <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                      No phase data yet
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--tf-text-faint)" }}>
                      Data appears after agent tasks run
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </GridSection>
    </div>
  );
}
