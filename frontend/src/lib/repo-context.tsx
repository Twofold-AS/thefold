"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { listRepos, type RepoInfo } from "@/lib/api";

export interface Repo {
  owner: string;
  name: string;
  fullName: string;
  status: "healthy" | "error" | "unknown";
  errorCount: number;
}

interface RepoContextValue {
  repos: Repo[];
  selectedRepo: Repo | null;
  selectRepo: (fullName: string) => void;
  loading: boolean;
}

const RepoContext = createContext<RepoContextValue | null>(null);

export function useRepoContext() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepoContext must be used within RepoProvider");
  return ctx;
}

const FALLBACK_REPOS: Repo[] = [
  { owner: "Twofold-AS", name: "thefold", fullName: "Twofold-AS/thefold", status: "healthy", errorCount: 0 },
];

function repoInfoToRepo(info: RepoInfo): Repo {
  const parts = info.fullName.split("/");
  return {
    owner: parts[0],
    name: parts[1] || info.name,
    fullName: info.fullName,
    status: info.archived ? "error" : "healthy",
    errorCount: info.openIssuesCount,
  };
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repo[]>(FALLBACK_REPOS);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(FALLBACK_REPOS[0] ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRepos("Twofold-AS")
      .then((res) => {
        if (res.repos.length > 0) {
          const mapped = res.repos
            .filter((r) => !r.archived)
            .map(repoInfoToRepo);
          if (mapped.length > 0) {
            setRepos(mapped);
            setSelectedRepo((prev) => {
              if (prev && mapped.some((r) => r.fullName === prev.fullName)) return prev;
              return mapped[0];
            });
          }
        }
      })
      .catch(() => {
        // API failed — keep fallback repos (graceful degradation)
      })
      .finally(() => setLoading(false));
  }, []);

  const selectRepo = useCallback((fullName: string) => {
    const repo = repos.find((r) => r.fullName === fullName);
    if (repo) setSelectedRepo(repo);
  }, [repos]);

  return (
    <RepoContext.Provider value={{ repos, selectedRepo, selectRepo, loading }}>
      {children}
    </RepoContext.Provider>
  );
}
