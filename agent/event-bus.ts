import { Topic } from "encore.dev/pubsub";
import type { AgentEvent } from "./events";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory event bus for SSE streaming
// ─────────────────────────────────────────────────────────────────────────────

type EventHandler = (event: AgentEvent) => void;

class AgentEventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  emit(key: string, event: AgentEvent): void {
    const handlers = this.listeners.get(key);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(event); } catch { /* ignore listener errors */ }
      }
    }
  }

  subscribe(key: string, handler: EventHandler): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(handler);
    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this.listeners.delete(key);
      }
    };
  }
}

export const agentEventBus = new AgentEventBus();

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
