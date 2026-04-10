import { Topic } from "encore.dev/pubsub";
import type { AgentEvent } from "./events";

// --- In-memory event bus for SSE streaming ---
// Used by tool-loop.ts (emit) and stream.ts (subscribe).

class AgentEventBusImpl {
  private listeners = new Map<string, Set<(event: AgentEvent) => void>>();

  emit(key: string, event: AgentEvent): void {
    const subs = this.listeners.get(key);
    if (!subs) return;
    for (const sub of subs) {
      try { sub(event); } catch { /* ignore subscriber errors */ }
    }
  }

  subscribe(key: string, callback: (event: AgentEvent) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);
    return () => {
      const subs = this.listeners.get(key);
      if (!subs) return;
      subs.delete(callback);
      if (subs.size === 0) this.listeners.delete(key);
    };
  }
}

export const agentEventBus = new AgentEventBusImpl();

// --- Agent Review Events ---

export interface AgentReviewEvent {
  taskId: string;
  reviewId: string;
  /** Number of findings emitted */
  findingCount: number;
  /** Highest severity found: "error" | "warning" | "info" */
  highestSeverity: "error" | "warning" | "info";
  findings: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file: string;
    line?: number;
    rule: string;
  }>;
  createdAt: string;
}

export const agentReviewEvents = new Topic<AgentReviewEvent>("agent-review-events", {
  deliveryGuarantee: "at-least-once",
});

// --- Agent Error Events (for critical failure notifications) ---

export interface AgentErrorEvent {
  taskId: string;
  conversationId?: string;
  error: string;
  phase: string;
  attempts: number;
  repo?: string;
  createdAt: string;
}

export const agentErrorEvents = new Topic<AgentErrorEvent>("agent-error-events", {
  deliveryGuarantee: "at-least-once",
});
