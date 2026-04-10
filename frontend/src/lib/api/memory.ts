import { apiFetch } from "./client";

// --- Types ---

export interface MemoryResult {
  id: string;
  content: string;
  category: string;
  relevance: number;
  createdAt: string;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  category: string;
  similarity: number;
  memoryType: string;
  relevanceScore: number;
  decayedScore: number;
  accessCount: number;
  tags: string[];
  sourceRepo?: string;
  createdAt: string;
}

// --- Memory API ---

export async function searchMemories(query: string, options?: {
  limit?: number;
  sourceRepo?: string;
  memoryType?: string;
  includeDecayed?: boolean;
}) {
  return apiFetch<{ results: MemorySearchResult[] }>("/memory/search", {
    method: "POST",
    body: { query, ...options },
  });
}

export async function storeMemory(content: string, category: string) {
  return apiFetch<{ id: string }>("/memory/store", {
    method: "POST",
    body: { content, category },
  });
}

export async function getMemoryStats() {
  return apiFetch<{
    total: number;
    byType: Record<string, number>;
    avgRelevanceScore: number;
    expiringSoon: number;
  }>("/memory/stats", { method: "GET" });
}
