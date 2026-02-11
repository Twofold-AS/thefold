"use client";

import { useRepoContext } from "@/lib/repo-context";
import { useRouter } from "next/navigation";

export default function EnvironmentsPage() {
  const { repos } = useRepoContext();
  const router = useRouter();

  return (
    <div>
      <h1 className="font-heading text-[32px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
        Environments
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        GitHub repositories connected to TheFold
      </p>

      <div className="mt-8 space-y-2">
        {repos.map((repo) => (
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
                  <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{repo.fullName}</span>
                  <span className="status-dot" style={{ background: repo.status === "error" ? "var(--error)" : "var(--success)" }} />
                </div>
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>github.com/{repo.fullName}</span>
              </div>
            </div>
            <span className="btn-outline">Open</span>
          </div>
        ))}
      </div>
    </div>
  );
}
