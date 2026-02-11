"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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
}

const RepoContext = createContext<RepoContextValue | null>(null);

export function useRepoContext() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepoContext must be used within RepoProvider");
  return ctx;
}

const INITIAL_REPOS: Repo[] = [
  { owner: "Twofold-AS", name: "thefold", fullName: "Twofold-AS/thefold", status: "healthy", errorCount: 0 },
];

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos] = useState<Repo[]>(INITIAL_REPOS);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(INITIAL_REPOS[0] ?? null);

  const selectRepo = useCallback((fullName: string) => {
    const repo = repos.find((r) => r.fullName === fullName);
    if (repo) setSelectedRepo(repo);
  }, [repos]);

  return (
    <RepoContext.Provider value={{ repos, selectedRepo, selectRepo }}>
      {children}
    </RepoContext.Provider>
  );
}
