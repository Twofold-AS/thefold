// --- Agent Event Bus ---
// In-process singleton that bridges the agent tool loop to SSE stream clients.
// One EventEmitter per active task (keyed by conversationId / taskId).
// SSE connections subscribe via subscribe(); the tool loop emits via emit().

import { EventEmitter } from "node:events";
import log from "encore.dev/log";
import type { AgentEvent } from "./events";

// Internal event name on each emitter — consumers don't need this
const AGENT_EVENT = "e";

// ─────────────────────────────────────────────────────────────────────────────
// Bus
// ─────────────────────────────────────────────────────────────────────────────

class AgentEventBus {
  /** taskId → EventEmitter (created lazily, destroyed by cleanup()) */
  private readonly emitters = new Map<string, EventEmitter>();

  /**
   * Get (or create) the emitter for a given taskId.
   * Called by stream.ts when a client connects before the task starts.
   */
  getEmitter(taskId: string): EventEmitter {
    let emitter = this.emitters.get(taskId);
    if (!emitter) {
      emitter = new EventEmitter();
      // Allow many SSE clients on a single task without Node warnings
      emitter.setMaxListeners(50);
      this.emitters.set(taskId, emitter);
    }
    return emitter;
  }

  /**
   * Emit an agent event to all current subscribers for this taskId.
   * If no clients are connected yet the event is dropped (no buffering).
   * Called from tool-loop.ts and agent-tool-executor.ts.
   */
  emit(taskId: string, event: AgentEvent): void {
    const emitter = this.emitters.get(taskId);
    if (!emitter) return; // No SSE clients yet — drop
    emitter.emit(AGENT_EVENT, event);
  }

  /**
   * Subscribe to all events for a taskId.
   * Creates the emitter if it doesn't exist (client connects before task starts).
   *
   * @returns An unsubscribe function — call it on SSE disconnect.
   */
  subscribe(taskId: string, handler: (event: AgentEvent) => void): () => void {
    const emitter = this.getEmitter(taskId);
    emitter.on(AGENT_EVENT, handler);
    return () => {
      emitter.off(AGENT_EVENT, handler);
    };
  }

  /**
   * Remove the emitter for a taskId and all its listeners.
   * Call this after the task completes (agent.done was emitted) to prevent leaks.
   */
  cleanup(taskId: string): void {
    const emitter = this.emitters.get(taskId);
    if (!emitter) return;
    emitter.removeAllListeners();
    this.emitters.delete(taskId);
    log.info("agent event bus: emitter cleaned up", { taskId });
  }

  /** Active emitter count — for diagnostics / health checks */
  get size(): number {
    return this.emitters.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const agentEventBus = new AgentEventBus();
