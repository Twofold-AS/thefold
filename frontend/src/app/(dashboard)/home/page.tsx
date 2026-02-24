"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getTaskStats,
  getCostSummary,
  getMemoryStats,
  getCacheStats,
  type CostSummary,
} from "@/lib/api";
import { GridSection } from "@/components/ui/corner-ornament";
import { ParticleField, EmberGlow } from "@/components/effects/ParticleField";
import { ArrowRight, Search } from "lucide-react";

export default function OverviewPage() {
  const router = useRouter();
  const [chatInput, setChatInput] = useState("");
  const [taskStats, setTaskStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [memoryStats, setMemoryStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const [cacheStats, setCacheStats] = useState<{ hitRate: number; totalEntries: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      getTaskStats().then(setTaskStats),
      getCostSummary().then(setCosts),
      getMemoryStats().then(setMemoryStats),
      getCacheStats().then(setCacheStats),
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

  return (
    <div className="min-h-full page-enter" style={{ background: "var(--tf-bg-base)" }}>
      {/* Header with search input */}
      <GridSection showTop={false} className="px-6 pt-8 pb-6 relative overflow-hidden">
        <ParticleField count={12} className="opacity-40" />
        <EmberGlow />
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-display-lg mb-1" style={{ color: "var(--tf-text-primary)" }}>
            Overview
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--tf-text-muted)" }}>
            Power your development with TheFold&apos;s autonomous agent
          </p>

          {/* Search / chat input */}
          <form onSubmit={handleChatSubmit} className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--tf-text-faint)" }}
            />
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask TheFold anything..."
              className="w-full rounded-lg py-3 pl-11 pr-4 text-sm outline-none transition-colors"
              style={{
                background: "var(--tf-surface)",
                border: "1px solid var(--tf-border-faint)",
                color: "var(--tf-text-primary)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tf-border-faint)"; }}
            />
          </form>
        </div>
      </GridSection>

      {/* Main grid — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px" style={{ background: "var(--tf-border-faint)" }}>
        {/* Left column */}
        <div style={{ background: "var(--tf-bg-base)" }}>
          {/* Tasks chart */}
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

            <div className="h-40 flex items-end gap-1 stagger-children">
              {(costs?.dailyTrend ?? Array(7).fill({ total: 0 })).slice(-7).map((day, i) => {
                const max = Math.max(...(costs?.dailyTrend?.map((d) => d.total) ?? [1]), 0.01);
                const height = Math.max(((day.total ?? 0) / max) * 100, 2);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm transition-all duration-500 ease-out"
                      style={{
                        height: `${height}%`,
                        background: "var(--tf-heat)",
                        minHeight: "2px",
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

          {/* Active tasks */}
          <GridSection className="px-6 py-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-medium" style={{ color: "var(--tf-text-primary)" }}>
                  Active Tasks
                </h2>
                {activeTasks > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wider" style={{ color: "var(--tf-success)", border: "1px solid var(--tf-success)" }}>
                    LIVE
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push("/tasks")}
                className="text-xs flex items-center gap-1 transition-colors hover:opacity-80"
                style={{ color: "var(--tf-heat)" }}
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
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
        </div>

        {/* Right column */}
        <div style={{ background: "var(--tf-bg-base)" }}>
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

          {/* Memory */}
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

          {/* Cache */}
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
        </div>
      </div>
    </div>
  );
}
