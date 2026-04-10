// --- Agent Event Bus ---
// In-process pub/sub bridge between the tool loop and SSE stream endpoint.
// The tool loop calls agentEventBus.emit(taskId, event) at key points.
// The SSE endpoint subscribes via agentEventBus.getEmitter(taskId).

import { EventEmitter } from "events";
import type { AgentEvent } from "./events";

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

  /** Remove all listeners and buffered events for a task after completion. */
  cleanup(taskId: string): void {
    this.emitters.get(taskId)?.removeAllListeners();
    this.emitters.delete(taskId);
    this.buffers.delete(taskId);
  }
}

export const agentEventBus = new AgentEventBus();
