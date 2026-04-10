import { EventEmitter } from "events";
import type { AgentEvent } from "./events";
import { Topic } from "encore.dev/pubsub";

// ─────────────────────────────────────────────────────────────────────────────
// In-process event bus for SSE streaming
// ─────────────────────────────────────────────────────────────────────────────

// Keep the last 100 events per task to support Last-Event-ID reconnection.
const BUFFER_SIZE = 100;

class AgentEventBus {
  private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, AgentEvent[]>();

  /** Get (or lazily create) the emitter for a task. */
  getEmitter(taskId: string): EventEmitter {
    if (!this.emitters.has(taskId)) {
      const emitter = new EventEmitter();
      // Allow many concurrent SSE clients per task without warning
      emitter.setMaxListeners(50);
      this.emitters.set(taskId, emitter);
    }
    return this.emitters.get(taskId)!;
  }

  /** Return the buffered events for a task (for reconnection replay). */
  getBuffer(taskId: string): AgentEvent[] {
    return this.buffers.get(taskId) ?? [];
  }

  /** Emit an event to all SSE clients listening on taskId and append to buffer. */
  emit(taskId: string, event: AgentEvent): void {
    if (!this.buffers.has(taskId)) {
      this.buffers.set(taskId, []);
    }
    const buffer = this.buffers.get(taskId)!;
    buffer.push(event);
    if (buffer.length > BUFFER_SIZE) buffer.shift();

    this.getEmitter(taskId).emit("event", event);
  }

  /** Subscribe to events for a taskId. Returns an unsubscribe function. */
  subscribe(taskId: string, handler: (event: AgentEvent) => void): () => void {
    const emitter = this.getEmitter(taskId);
    emitter.on("event", handler);
    return () => emitter.off("event", handler);
  }

  /** Remove all listeners and buffered events for a task after completion. */
  cleanup(taskId: string): void {
    this.emitters.get(taskId)?.removeAllListeners();
    this.emitters.delete(taskId);
    this.buffers.delete(taskId);
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
