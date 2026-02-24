"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRepoContext } from "@/lib/repo-context";
import { getMonitorHealth } from "@/lib/api";
import { GridSection } from "@/components/ui/corner-ornament";
import { ParticleField, EmberGlow } from "@/components/effects/ParticleField";
import {
  GitBranch,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
} from "lucide-react";

export default function ReposPage() {
  const router = useRouter();
  const { repos, selectedRepo, selectRepo } = useRepoContext();
  const [health, setHealth] = useState<Record<string, Array<{ checkType: string; status: string; details: Record<string, unknown> }>>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getMonitorHealth()
      .then((res) => setHealth(res.repos))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const healthyRepos = repos.filter((r) => r.status === "healthy").length;

  const filteredRepos = searchQuery.trim()
    ? repos.filter((r) =>
        r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : repos;

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
            Repos
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255, 107, 44, 0.08)", color: "var(--tf-heat)" }}>
              {repos.length} connected
            </span>
            {healthyRepos > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(66, 195, 102, 0.08)", color: "var(--tf-success)" }}>
                {healthyRepos} healthy
              </span>
            )}
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
          Connected repositories and health status
        </p>
      </GridSection>

      {/* Content */}
      <GridSection className="px-6 py-6">
        <div className="max-w-3xl">
          {/* Search */}
          <div className="relative mb-6">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--tf-text-faint)" }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="w-full rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none transition-colors"
              style={{
                background: "var(--tf-surface)",
                border: "1px solid var(--tf-border-faint)",
                color: "var(--tf-text-primary)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tf-heat)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--tf-border-faint)"; }}
            />
          </div>

          {/* Repo list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 rounded-lg" />
              ))}
            </div>
          ) : filteredRepos.length === 0 ? (
            <div
              className="text-center py-12 rounded-lg"
              style={{ border: "1px solid var(--tf-border-faint)" }}
            >
              <GitBranch className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--tf-text-faint)" }} />
              <p className="text-sm" style={{ color: "var(--tf-text-muted)" }}>
                {searchQuery ? "No matching repositories" : "No repositories connected"}
              </p>
              {!searchQuery && (
                <p className="text-xs mt-1" style={{ color: "var(--tf-text-faint)" }}>
                  Connect a GitHub repository to get started
                </p>
              )}
            </div>
          ) : (
            <div
              className="rounded-lg divide-y overflow-hidden"
              style={{ border: "1px solid var(--tf-border-faint)" }}
            >
              {filteredRepos.map((repo) => {
                const checks = health[repo.name] || [];
                const passCount = checks.filter((c) => c.status === "pass").length;
                const warnCount = checks.filter((c) => c.status === "warn").length;
                const failCount = checks.filter((c) => c.status === "fail").length;
                const isSelected = selectedRepo?.name === repo.name;

                return (
                  <div
                    key={repo.fullName}
                    className="px-4 py-3.5 transition-colors cursor-pointer hover:bg-[var(--tf-surface)]"
                    style={{
                      background: isSelected ? "rgba(255, 107, 44, 0.03)" : "transparent",
                    }}
                    onClick={() => {
                      selectRepo(repo.name);
                      router.push(`/chat`);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GitBranch
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: isSelected ? "var(--tf-heat)" : "var(--tf-text-faint)" }}
                        />
                        <div>
                          <span className="text-sm font-medium" style={{ color: "var(--tf-text-primary)" }}>
                            {repo.fullName}
                          </span>
                          {repo.errorCount > 0 && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--tf-text-faint)" }}>
                              {repo.errorCount} issues
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {repo.status !== "unknown" && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{
                              background: repo.status === "healthy" ? "rgba(66, 195, 102, 0.08)" : "rgba(235, 52, 36, 0.08)",
                              color: repo.status === "healthy" ? "var(--tf-success)" : "var(--tf-error)",
                            }}
                          >
                            {repo.status}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          {passCount > 0 && (
                            <div className="flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" style={{ color: "var(--tf-success)" }} />
                              <span className="text-[10px]" style={{ color: "var(--tf-success)" }}>{passCount}</span>
                            </div>
                          )}
                          {warnCount > 0 && (
                            <div className="flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" style={{ color: "var(--tf-warning)" }} />
                              <span className="text-[10px]" style={{ color: "var(--tf-warning)" }}>{warnCount}</span>
                            </div>
                          )}
                          {failCount > 0 && (
                            <div className="flex items-center gap-0.5">
                              <XCircle className="w-3 h-3" style={{ color: "var(--tf-error)" }} />
                              <span className="text-[10px]" style={{ color: "var(--tf-error)" }}>{failCount}</span>
                            </div>
                          )}
                        </div>
                        <a
                          href={`https://github.com/${repo.fullName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded transition-colors hover:bg-[var(--tf-surface-raised)]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" style={{ color: "var(--tf-text-faint)" }} />
                        </a>
                      </div>
                    </div>

                    {checks.length > 0 && (
                      <div className="flex gap-2 mt-2.5 ml-7 flex-wrap">
                        {checks.map((check, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{
                              background:
                                check.status === "pass"
                                  ? "rgba(66, 195, 102, 0.08)"
                                  : check.status === "warn"
                                    ? "rgba(236, 183, 48, 0.08)"
                                    : "rgba(235, 52, 36, 0.08)",
                              color:
                                check.status === "pass"
                                  ? "var(--tf-success)"
                                  : check.status === "warn"
                                    ? "var(--tf-warning)"
                                    : "var(--tf-error)",
                            }}
                          >
                            {check.checkType}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GridSection>
    </div>
  );
}
