"use client";

import { useState, useEffect } from "react";
import {
  searchMemories,
  storeMemory,
  getMemoryStats,
  listRepos,
  type MemorySearchResult,
} from "@/lib/api";

function decayColor(score: number): string {
  if (score > 0.7) return "#22c55e";
  if (score > 0.3) return "#eab308";
  return "#ef4444";
}

function decayLabel(score: number): string {
  if (score > 0.7) return "Fersk";
  if (score > 0.3) return "Aldres";
  return "Utg\u00E5r";
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "i dag";
  if (days === 1) return "i g\u00E5r";
  if (days < 30) return `${days}d siden`;
  if (days < 365) return `${Math.floor(days / 30)}m siden`;
  return `${Math.floor(days / 365)}\u00E5r siden`;
}

const TYPE_LABELS: Record<string, string> = {
  error_pattern: "Feilm\u00F8nster",
  decision: "Beslutning",
  general: "Generelt",
  session: "Sesjon",
  skill: "Skill",
  task: "Oppgave",
};

export default function ToolsMemoryPage() {
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [repos, setRepos] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<{
    total: number;
    byType: Record<string, number>;
    avgRelevanceScore: number;
    expiringSoon: number;
  } | null>(null);

  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [storing, setStoring] = useState(false);
  const [storeSuccess, setStoreSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, reposRes] = await Promise.all([
          getMemoryStats(),
          listRepos("Twofold-AS"),
        ]);
        setStats(statsRes);
        setRepos(reposRes.repos.map((r) => r.name));
      } catch {
        // silent
      }
    }
    load();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError(null);
    try {
      const res = await searchMemories(query.trim(), {
        sourceRepo: repoFilter !== "all" ? `Twofold-AS/${repoFilter}` : undefined,
        limit: 20,
        includeDecayed: true,
      });
      setResults(res.results);
      setSearched(true);
    } catch {
      setError("Kunne ikke s\u00F8ke i minner");
    } finally {
      setSearching(false);
    }
  }

  async function handleStore(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;

    setStoring(true);
    setStoreSuccess(false);
    try {
      await storeMemory(newContent.trim(), newCategory);
      setStoreSuccess(true);
      setNewContent("");
      // Refresh stats
      const statsRes = await getMemoryStats();
      setStats(statsRes);
    } catch {
      // Silent
    } finally {
      setStoring(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Totalt minner</div>
            <div className="text-2xl font-mono font-medium" style={{ color: "var(--text-primary)" }}>{stats.total}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Snitt relevans</div>
            <div className="text-2xl font-mono font-medium" style={{ color: "var(--text-primary)" }}>
              {(stats.avgRelevanceScore * 100).toFixed(0)}%
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Utg&aring;r snart</div>
            <div className="text-2xl font-mono font-medium" style={{ color: stats.expiringSoon > 0 ? "#eab308" : "var(--text-primary)" }}>
              {stats.expiringSoon}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Typer</div>
            <div className="text-2xl font-mono font-medium" style={{ color: "var(--text-primary)" }}>
              {Object.keys(stats.byType).length}
            </div>
          </div>
        </div>
      )}

      {/* Repo filter + Search */}
      <div className="card p-5">
        <h3 className="text-sm font-sans font-medium mb-4" style={{ color: "var(--text-primary)" }}>
          S&oslash;k i minner
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            className="input-field text-sm"
            style={{ width: "auto", minWidth: "160px" }}
          >
            <option value="all">Alle repos</option>
            {repos.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hva leter du etter?"
              className="input-field flex-1"
            />
            <button type="submit" disabled={searching} className="btn-secondary">
              {searching ? "S\u00F8ker..." : "S\u00F8k"}
            </button>
          </form>
        </div>

        {error && (
          <div className="mt-4 text-sm px-3 py-2" style={{ color: "var(--error)", background: "rgba(239,68,68,0.1)", borderLeft: "3px solid var(--error)" }}>
            {error}
          </div>
        )}

        {searched && results.length === 0 && !error && (
          <div className="mt-4 text-center py-6">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Ingen minner funnet
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((mem) => (
              <div
                key={mem.id}
                className="px-3 py-3 rounded"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                  >
                    {TYPE_LABELS[mem.memoryType] || mem.memoryType}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                  >
                    {mem.category}
                  </span>
                  {mem.sourceRepo && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                    >
                      {mem.sourceRepo.split("/").pop()}
                    </span>
                  )}
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto"
                    style={{ background: `${decayColor(mem.decayedScore)}20`, color: decayColor(mem.decayedScore) }}
                    title={`Relevans: ${(mem.decayedScore * 100).toFixed(0)}%`}
                  >
                    {decayLabel(mem.decayedScore)} ({(mem.decayedScore * 100).toFixed(0)}%)
                  </span>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {mem.content.length > 300 ? mem.content.substring(0, 300) + "..." : mem.content}
                </p>

                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {timeAgo(mem.createdAt)}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Aksessert {mem.accessCount}x
                  </span>
                  {mem.tags.length > 0 && (
                    <div className="flex gap-1">
                      {mem.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1 py-0.5 rounded"
                          style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: "40px", background: "var(--bg-tertiary)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${mem.decayedScore * 100}%`, background: decayColor(mem.decayedScore) }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Store memory */}
      <div className="card p-5">
        <h3 className="text-sm font-sans font-medium mb-4" style={{ color: "var(--text-primary)" }}>
          Lagre minne
        </h3>
        <form onSubmit={handleStore} className="space-y-4">
          <div>
            <label className="section-label block mb-1">Kategori</label>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="input-field" style={{ width: "auto" }}>
              <option value="general">Generelt</option>
              <option value="decision">Beslutning</option>
              <option value="pattern">M&oslash;nster</option>
              <option value="conversation">Samtale</option>
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Innhold</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Skriv noe TheFold skal huske..."
              rows={4}
              className="input-field"
              style={{ resize: "vertical" }}
            />
          </div>
          {storeSuccess && (
            <div className="text-sm px-3 py-2" style={{ color: "#22c55e", background: "rgba(34, 197, 94, 0.1)", borderLeft: "3px solid #22c55e" }}>
              Minne lagret
            </div>
          )}
          <button type="submit" disabled={storing || !newContent.trim()} className="btn-primary">
            {storing ? "Lagrer..." : "Lagre minne"}
          </button>
        </form>
      </div>

      {/* Type breakdown */}
      {stats && Object.keys(stats.byType).length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-sans font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            Per type
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.byType).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {TYPE_LABELS[type] || type}
                </span>
                <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
