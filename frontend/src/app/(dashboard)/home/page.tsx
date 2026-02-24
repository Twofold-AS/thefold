"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  getTaskStats,
  getCostSummary,
  getMemoryStats,
  getCacheStats,
  getSecretsStatus,
  listIntegrations,
  type CostSummary,
  type SecretStatus,
  type IntegrationConfig,
} from "@/lib/api";
import { GridSection } from "@/components/ui/corner-ornament";
import { ParticleField, EmberGlow } from "@/components/effects/ParticleField";
import {
  ArrowRight,
  MessageSquare,
  GitBranch,
  Puzzle,
  Brain,
  Key,
  Eye,
  EyeOff,
  Copy,
  Zap,
  Activity,
} from "lucide-react";

const Dither = dynamic(() => import("@/components/effects/Dither"), {
  ssr: false,
});

export default function OverviewPage() {
  const router = useRouter();
  const [chatInput, setChatInput] = useState("");
  const [taskStats, setTaskStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [memoryStats, setMemoryStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const [cacheStats, setCacheStats] = useState<{ hitRate: number; totalEntries: number } | null>(null);
  const [secrets, setSecrets] = useState<SecretStatus[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      getTaskStats().then(setTaskStats),
      getCostSummary().then(setCosts),
      getMemoryStats().then(setMemoryStats),
      getCacheStats().then(setCacheStats),
      getSecretsStatus().then((res) => setSecrets(res.secrets)),
      listIntegrations().then((res) => setIntegrations(res.configs)),
    ]).finally(() => setLoading(false));
  }, []);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      router.push(`/chat?q=${encodeURIComponent(chatInput.trim())}`);
    } else {
      router.push("/chat");
    }
  };

  const activeTasks = taskStats?.byStatus?.in_progress ?? 0;
  const configuredSecrets = secrets.filter((s) => s.configured).length;

  // Feature cards matching Firecrawl's "Explore our endpoints" pattern
  const features = [
    {
      icon: <MessageSquare className="w-4 h-4" style={{ color: "var(--tf-heat)" }} />,
      title: "Chat",
      description: "Talk to TheFold. Ask questions, describe tasks, review code.",
      href: "/chat",
    },
    {
      icon: <GitBranch className="w-4 h-4" style={{ color: "var(--tf-heat)" }} />,
      title: "Repos",
      description: "Manage connected GitHub repositories and health status.",
      href: "/repos",
    },
    {
      icon: <Puzzle className="w-4 h-4" style={{ color: "var(--tf-heat)" }} />,
      title: "Components",
      description: "Browse and use reusable components and templates.",
      href: "/components",
    },
    {
      icon: <Brain className="w-4 h-4" style={{ color: "var(--tf-heat)" }} />,
      title: "AI",
      description: "Providers, models, costs and token budgets.",
      href: "/ai",
      badge: "NEW",
    },
  ];

  return (
    <div className="min-h-full page-enter" style={{ background: "var(--tf-bg-base)" }}>
      {/* Header section with particle field */}
      <GridSection showTop={false} className="px-6 pt-8 pb-6 relative overflow-hidden">
        <ParticleField count={12} className="opacity-40" />
        <EmberGlow />
        <div className="relative z-10">
          <h1 className="text-display-lg mb-1" style={{ color: "var(--tf-text-primary)" }}>
            Explore our features
          </h1>
          <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
            Power your development with TheFold&apos;s autonomous agent
          </p>
        </div>
      </GridSection>

      {/* Feature cards — matches Firecrawl's endpoint cards */}
      <GridSection className="px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px stagger-children" style={{ background: "var(--tf-border-faint)" }}>
          {features.map((f) => (
            <button
              key={f.title}
              onClick={() => router.push(f.href)}
              className="feature-card text-left p-5 transition-all group relative overflow-hidden"
              style={{ background: "var(--tf-bg-base)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--tf-surface-raised)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--tf-bg-base)";
              }}
            >
              {/* Hover glow overlay */}
              <div
                className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: "radial-gradient(ellipse at 30% 20%, rgba(255, 107, 44, 0.06) 0%, transparent 60%)",
                }}
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="feature-icon">{f.icon}</span>
                  <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                    {f.title}
                  </span>
                  {f.badge && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-medium badge-sparkle"
                      style={{ background: "var(--tf-heat)", color: "white" }}
                    >
                      {f.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--tf-text-muted)" }}>
                  {f.description}
                </p>
              </div>
              {/* Arrow that slides in on hover */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200">
                <ArrowRight className="w-4 h-4" style={{ color: "var(--tf-heat)" }} />
              </div>
            </button>
          ))}
        </div>
      </GridSection>

      {/* Main grid — 2 columns like Firecrawl */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div>
          {/* Tasks chart — "Scraped pages - Last 7 days" equivalent */}
          <GridSection className="px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-medium" style={{ color: "var(--tf-text-primary)" }}>
                  Tasks — Last 7 days
                </h2>
                <p className="text-xs" style={{ color: "var(--tf-text-muted)" }}>
                  {activeTasks > 0 ? `${activeTasks} active now` : "No active tasks"}
                </p>
              </div>
              <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--tf-text-primary)" }}>
                {loading ? "—" : taskStats?.total ?? 0}
              </span>
            </div>

            {/* Bar chart with animated bars */}
            <div className="h-40 flex items-end gap-1 stagger-children">
              {(costs?.dailyTrend ?? Array(7).fill({ total: 0 })).slice(-7).map((day, i) => {
                const max = Math.max(...(costs?.dailyTrend?.map((d) => d.total) ?? [1]), 0.01);
                const height = Math.max(((day.total ?? 0) / max) * 100, 2);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group/bar">
                    <div
                      className="w-full rounded-sm transition-all duration-500 ease-out group-hover/bar:brightness-125"
                      style={{
                        height: `${height}%`,
                        background: "var(--tf-heat)",
                        minHeight: "2px",
                        boxShadow: height > 20 ? "0 0 8px rgba(255, 107, 44, 0.2)" : "none",
                        animationDelay: `${i * 80}ms`,
                      }}
                    />
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--tf-text-faint)" }}>
                      {day.date ? new Date(day.date).toLocaleDateString("en", { month: "2-digit", day: "2-digit" }) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </GridSection>

          {/* Active tasks / live indicator */}
          <GridSection className="px-6 py-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-base font-medium" style={{ color: "var(--tf-text-primary)" }}>
                Active Tasks
              </h2>
              {activeTasks > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wider" style={{ color: "var(--tf-success)", border: "1px solid var(--tf-success)" }}>
                  LIVE
                </span>
              )}
            </div>
            <p className="text-xs mb-4" style={{ color: "var(--tf-text-muted)" }}>
              {activeTasks} of {taskStats?.total ?? 0} tasks in progress
            </p>
            {taskStats ? (
              <div className="space-y-2">
                {Object.entries(taskStats.byStatus)
                  .filter(([, count]) => count > 0)
                  .sort(([a], [b]) => {
                    const order = ["in_progress", "planned", "in_review", "backlog", "done", "blocked"];
                    return order.indexOf(a) - order.indexOf(b);
                  })
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background:
                              status === "in_progress" ? "var(--tf-heat)"
                              : status === "done" ? "var(--tf-success)"
                              : status === "blocked" ? "var(--tf-error)"
                              : status === "in_review" ? "var(--tf-warning)"
                              : "var(--tf-text-faint)",
                          }}
                        />
                        <span className="text-sm capitalize" style={{ color: "var(--tf-text-secondary)" }}>
                          {status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="text-sm font-mono tabular-nums" style={{ color: "var(--tf-text-primary)" }}>
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            ) : !loading ? (
              <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>No tasks yet</p>
            ) : (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-6 rounded animate-pulse" style={{ background: "var(--tf-surface-raised)" }} />
                ))}
              </div>
            )}
          </GridSection>

          {/* Integrations grid */}
          <GridSection className="px-6 py-6">
            <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
              Integrations
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--tf-text-muted)" }}>
              Connected services and tools
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px stagger-children" style={{ background: "var(--tf-border-faint)" }}>
              {[
                { name: "GitHub", icon: <GitBranch className="w-4 h-4" />, connected: true },
                { name: "Linear", icon: <Activity className="w-4 h-4" />, connected: true },
                { name: "Memory", icon: <Brain className="w-4 h-4" />, connected: true },
                ...(integrations.map((i) => ({
                  name: i.platform,
                  icon: <Zap className="w-4 h-4" />,
                  connected: i.enabled,
                }))),
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-3 p-4 capitalize transition-colors group/int"
                  style={{ background: "var(--tf-bg-base)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tf-surface)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--tf-bg-base)"; }}
                >
                  <span
                    className="transition-all group-hover/int:scale-110"
                    style={{ color: item.connected ? "var(--tf-text-secondary)" : "var(--tf-text-faint)" }}
                  >
                    {item.icon}
                  </span>
                  <span className="text-sm" style={{ color: item.connected ? "var(--tf-text-primary)" : "var(--tf-text-faint)" }}>
                    {item.name}
                  </span>
                  {item.connected && (
                    <div className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: "var(--tf-success)" }} />
                  )}
                </div>
              ))}
            </div>
          </GridSection>
        </div>

        {/* Right column — vertical border line like Firecrawl */}
        <div style={{ borderLeft: "1px solid var(--tf-border-faint)" }}>
          {/* Secrets / API Key section */}
          <GridSection className="px-6 py-6">
            <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
              Secrets
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--tf-text-muted)" }}>
              {configuredSecrets} of {secrets.length} configured
            </p>
            {secrets.length > 0 ? (
              <div className="space-y-2">
                {secrets.map((s) => (
                  <div key={s.name} className="flex items-center justify-between py-1">
                    <span className="text-xs font-mono" style={{ color: "var(--tf-text-secondary)" }}>
                      {s.name}
                    </span>
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: s.configured ? "var(--tf-success)" : "var(--tf-error)" }}
                    />
                  </div>
                ))}
              </div>
            ) : !loading ? (
              <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>No secrets</p>
            ) : (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-5 rounded animate-pulse" style={{ background: "var(--tf-surface-raised)" }} />
                ))}
              </div>
            )}
          </GridSection>

          {/* Memory section */}
          <GridSection className="px-6 py-6">
            <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
              Memory
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--tf-text-muted)" }}>
              Semantic knowledge base
            </p>
            {memoryStats ? (
              <div className="space-y-2">
                {Object.entries(memoryStats.byType)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between py-1">
                      <span className="text-sm capitalize" style={{ color: "var(--tf-text-secondary)" }}>
                        {type.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-mono tabular-nums" style={{ color: "var(--tf-text-primary)" }}>
                        {count}
                      </span>
                    </div>
                  ))}
                <div className="flex items-center justify-between pt-2 mt-2 border-t" style={{ borderColor: "var(--tf-border-faint)" }}>
                  <span className="text-xs font-medium" style={{ color: "var(--tf-text-muted)" }}>Total</span>
                  <span className="text-sm font-mono font-medium" style={{ color: "var(--tf-text-primary)" }}>
                    {memoryStats.total}
                  </span>
                </div>
              </div>
            ) : !loading ? (
              <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>No memories stored</p>
            ) : (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-5 rounded animate-pulse" style={{ background: "var(--tf-surface-raised)" }} />
                ))}
              </div>
            )}
          </GridSection>

          {/* Cache section */}
          <GridSection className="px-6 py-6">
            <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
              Cache
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--tf-text-muted)" }}>
              Hit rate and entries
            </p>
            {cacheStats ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>Hit Rate</span>
                    <span className="text-sm font-mono" style={{ color: "var(--tf-text-primary)" }}>
                      {Number(cacheStats.hitRate).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full relative" style={{ background: "var(--tf-border-faint)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.min(Number(cacheStats.hitRate), 100)}%`,
                        background: "var(--tf-heat)",
                        boxShadow: Number(cacheStats.hitRate) > 50 ? "0 0 8px rgba(255, 107, 44, 0.3)" : "none",
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>Total Entries</span>
                  <span className="text-sm font-mono" style={{ color: "var(--tf-text-primary)" }}>
                    {cacheStats.totalEntries}
                  </span>
                </div>
              </div>
            ) : !loading ? (
              <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>No cache data</p>
            ) : (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-5 rounded animate-pulse" style={{ background: "var(--tf-surface-raised)" }} />
                ))}
              </div>
            )}
          </GridSection>

          {/* Cost today */}
          <GridSection className="px-6 py-6">
            <h2 className="text-base font-medium mb-1" style={{ color: "var(--tf-text-primary)" }}>
              Cost Today
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--tf-text-muted)" }}>
              Token usage and spend
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>Today</span>
                <span className="text-lg font-mono font-bold" style={{ color: "var(--tf-text-primary)" }}>
                  ${loading ? "—" : Number(costs?.today.total ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>Tokens</span>
                <span className="text-sm font-mono" style={{ color: "var(--tf-text-secondary)" }}>
                  {loading ? "—" : (costs?.today.tokens ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--tf-border-faint)" }}>
                <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>This week</span>
                <span className="text-sm font-mono" style={{ color: "var(--tf-text-secondary)" }}>
                  ${loading ? "—" : Number(costs?.thisWeek.total ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--tf-text-muted)" }}>This month</span>
                <span className="text-sm font-mono" style={{ color: "var(--tf-text-secondary)" }}>
                  ${loading ? "—" : Number(costs?.thisMonth.total ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </GridSection>
        </div>
      </div>
    </div>
  );
}
