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
  clearRepo: () => void;
  loading: boolean;
  error: string | null;
}

const RepoContext = createContext<RepoContextValue | null>(null);

export function useRepoContext() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepoContext must be used within RepoProvider");
  return ctx;
}

const FALLBACK_REPOS: Repo[] = [];

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

const STORAGE_KEY = "thefold-selected-repo";

function getSavedRepoFullName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function saveRepoFullName(fullName: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, fullName);
  }
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRepos() // No hardcoded org — backend uses PAT to list accessible repos
      .then((res) => {
        const mapped = res.repos
          .filter((r) => !r.archived)
          .map(repoInfoToRepo);
        setRepos(mapped);
        setSelectedRepo((prev) => {
          const saved = getSavedRepoFullName();
          if (saved) {
            const savedRepo = mapped.find((r) => r.fullName === saved);
            if (savedRepo) return savedRepo;
          }
          if (prev && mapped.some((r) => r.fullName === prev.fullName)) return prev;
          // Ikke auto-velg første repo — null = Global modus
          return null;
        });
      })
      .catch(() => {
        setError("Kunne ikke laste repos. Sjekk GitHub-tilkoblingen.");
        setRepos([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectRepo = useCallback((fullName: string) => {
    const repo = repos.find((r) => r.fullName === fullName);
    if (repo) {
      setSelectedRepo(repo);
      saveRepoFullName(fullName);
    }
  }, [repos]);

  const clearRepo = useCallback(() => {
    setSelectedRepo(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <RepoContext.Provider value={{ repos, selectedRepo, selectRepo, clearRepo, loading, error }}>
      {children}
    </RepoContext.Provider>
  );
}
