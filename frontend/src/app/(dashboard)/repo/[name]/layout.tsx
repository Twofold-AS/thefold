"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useRepoContext } from "@/lib/repo-context";

export default function RepoLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ name: string }>();
  const { selectedRepo, selectRepo, repos } = useRepoContext();

  useEffect(() => {
    const repo = repos.find((r) => r.name === params.name);
    if (repo && selectedRepo?.name !== params.name) {
      selectRepo(repo.fullName);
    }
  }, [params.name, repos, selectedRepo, selectRepo]);

  const repo = repos.find((r) => r.name === params.name);

  return (
    <div>
      {repo?.status === "error" && (
        <div
          className="mb-4 px-4 py-3 text-sm"
          style={{ background: "rgba(239, 68, 68, 0.1)", borderLeft: "3px solid var(--error)", color: "var(--error)" }}
        >
          This repo has {repo.errorCount} failed task(s) or sandbox errors.
        </div>
      )}
      {children}
    </div>
  );
}
