"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listRepos, type RepoInfo } from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

export default function EnvironmentsPage() {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    listRepos("Twofold-AS")
      .then((res) => setRepos(res.repos))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load repos"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeaderBar title="Environments" />
      <div className="p-6">
      {error && (
        <div className="mt-4 px-4 py-3 text-sm" style={{ background: "#2d1b1b", color: "#f87171", border: "1px solid #7f1d1d" }}>
          {error}
        </div>
      )}

      <div className="mt-8 space-y-2">
        {loading ? (
          <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>Loading repositories...</p>
        ) : repos.length === 0 ? (
          <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>No repositories found.</p>
        ) : (
          repos.map((repo) => (
            <div
              key={repo.fullName}
              className="card flex items-center justify-between cursor-pointer"
              style={{ padding: "16px 24px" }}
              onClick={() => router.push(`/repo/${repo.name}/overview`)}
            >
              <div className="flex items-center gap-4">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--text-muted)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                </svg>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-sans font-semibold" style={{ color: "var(--text-primary)" }}>{repo.fullName}</span>
                    {repo.language && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                        {repo.language}
                      </span>
                    )}
                    {repo.private && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#713f12", color: "#facc15" }}>
                        private
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {repo.description || `github.com/${repo.fullName}`}
                    </span>
                    {repo.pushedAt && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        · pushed {formatTimeAgo(repo.pushedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="btn-outline">Open</span>
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
