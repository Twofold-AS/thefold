"use client";

import { useState, useEffect, useCallback } from "react";
import type { SubAgentSidebarData } from "@/components/SubAgentSidebarItem";

/**
 * Hook to track sub-agent status.
 * Listens to a global event bus for sub-agent updates from the agent stream.
 * Falls back to localStorage for persistence across page navigations.
 */

const STORAGE_KEY = "tf_sub_agents";

function loadFromStorage(): SubAgentSidebarData[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage(agents: SubAgentSidebarData[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // Non-critical
  }
}

export function useSubAgentStatus() {
  const [agents, setAgents] = useState<SubAgentSidebarData[]>(loadFromStorage);
  const [enabled, setEnabled] = useState(false);

  // Persist to storage
  useEffect(() => {
    saveToStorage(agents);
  }, [agents]);

  // Listen for sub-agent updates (dispatched from agent stream)
  useEffect(() => {
    const handler = (e: CustomEvent<{ agents: SubAgentSidebarData[]; enabled: boolean }>) => {
      setAgents(e.detail.agents);
      setEnabled(e.detail.enabled);
    };
    window.addEventListener("tf-sub-agents" as any, handler);
    return () => window.removeEventListener("tf-sub-agents" as any, handler);
  }, []);

  const stopAgent = useCallback((agentId: string) => {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, status: "failed" as const } : a
    ));
    // Dispatch stop event for the agent stream to pick up
    window.dispatchEvent(new CustomEvent("tf-sub-agent-stop", { detail: { agentId } }));
  }, []);

  const clearAgents = useCallback(() => {
    setAgents([]);
    setEnabled(false);
    saveToStorage([]);
  }, []);

  const activeAgents = agents.filter(a => a.status === "working");
  const hasActiveAgents = activeAgents.length > 0;

  return {
    agents,
    enabled,
    activeAgents,
    hasActiveAgents,
    stopAgent,
    clearAgents,
  };
}

/**
 * Dispatch sub-agent update from the agent stream.
 * Called from useAgentStream when sub-agent info is received.
 */
export function dispatchSubAgentUpdate(agents: SubAgentSidebarData[], enabled: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tf-sub-agents", { detail: { agents, enabled } }));
}
