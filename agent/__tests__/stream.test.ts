import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentEvent, formatSSE } from "../events";
import type { AgentEvent } from "../events";

// ─────────────────────────────────────────────────────────────────────────────
// createAgentEvent()
// ─────────────────────────────────────────────────────────────────────────────

describe("createAgentEvent()", () => {
  it("produces an event with the correct type", () => {
    const event = createAgentEvent("agent.status", { status: "planning" });
    expect(event.type).toBe("agent.status");
  });

  it("auto-generates a UUID id when none provided", () => {
    const event = createAgentEvent("agent.heartbeat", { ts: Date.now() });
    expect(event.id).toBeTruthy();
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("uses provided id when given", () => {
    const event = createAgentEvent("agent.heartbeat", { ts: 1000 }, "custom-id-123");
    expect(event.id).toBe("custom-id-123");
  });

  it("sets a valid ISO 8601 timestamp", () => {
    const before = new Date().toISOString();
    const event = createAgentEvent("agent.heartbeat", { ts: Date.now() });
    const after = new Date().toISOString();
    expect(event.timestamp >= before).toBe(true);
    expect(event.timestamp <= after).toBe(true);
  });

  it("carries the data payload intact", () => {
    const event = createAgentEvent("agent.message", {
      role: "assistant",
      content: "Hello world",
      model: "claude-sonnet-4-5",
    });
    expect(event.data.content).toBe("Hello world");
    expect(event.data.role).toBe("assistant");
    expect(event.data.model).toBe("claude-sonnet-4-5");
  });

  it("creates an agent.done event with all fields", () => {
    const event = createAgentEvent("agent.done", {
      finalText: "Task complete",
      toolsUsed: ["read_file", "write_file"],
      filesWritten: 3,
      totalInputTokens: 1500,
      totalOutputTokens: 800,
      costUsd: 0.0042,
      loopsUsed: 4,
      stoppedAtMaxLoops: false,
    });
    expect(event.data.filesWritten).toBe(3);
    expect(event.data.toolsUsed).toHaveLength(2);
    expect(event.data.costUsd).toBeCloseTo(0.0042);
  });

  it("creates an agent.error event with recoverable flag", () => {
    const event = createAgentEvent("agent.error", {
      message: "AI call failed",
      code: "ai_error",
      recoverable: true,
    });
    expect(event.data.message).toBe("AI call failed");
    expect(event.data.recoverable).toBe(true);
  });

  it("creates an agent.progress event", () => {
    const event = createAgentEvent("agent.progress", {
      step: "Writing src/api.ts",
      current: 2,
      total: 5,
    });
    expect(event.data.step).toBe("Writing src/api.ts");
    expect(event.data.current).toBe(2);
    expect(event.data.total).toBe(5);
  });

  it("creates distinct ids for consecutive calls", () => {
    const e1 = createAgentEvent("agent.heartbeat", { ts: 1 });
    const e2 = createAgentEvent("agent.heartbeat", { ts: 2 });
    expect(e1.id).not.toBe(e2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatSSE()
// ─────────────────────────────────────────────────────────────────────────────

describe("formatSSE()", () => {
  it("produces a string ending with double newline", () => {
    const event = createAgentEvent("agent.heartbeat", { ts: 0 });
    const wire = formatSSE(event);
    expect(wire.endsWith("\n\n")).toBe(true);
  });

  it("includes id: line with the event id", () => {
    const event = createAgentEvent("agent.heartbeat", { ts: 0 }, "test-id-abc");
    const wire = formatSSE(event);
    expect(wire).toContain("id: test-id-abc\n");
  });

  it("includes event: line with the full event type", () => {
    const event = createAgentEvent("agent.tool_use", {
      toolName: "read_file",
      toolUseId: "tu-1",
      input: { path: "/src/api.ts" },
      loopIteration: 1,
    });
    const wire = formatSSE(event);
    expect(wire).toContain("event: agent.tool_use\n");
  });

  it("includes data: line with JSON payload", () => {
    const event = createAgentEvent("agent.status", { status: "building", phase: "building" });
    const wire = formatSSE(event);
    const dataLine = wire
      .split("\n")
      .find((line) => line.startsWith("data: "));
    expect(dataLine).toBeTruthy();
    const payload = JSON.parse(dataLine!.slice("data: ".length));
    expect(payload.data.status).toBe("building");
    expect(payload.timestamp).toBeTruthy();
  });

  it("wire format has exactly 4 parts (id, event, data, empty)", () => {
    const event = createAgentEvent("agent.heartbeat", { ts: 0 });
    const wire = formatSSE(event);
    // Split on \n — last element after \n\n is an empty string
    const lines = wire.split("\n");
    expect(lines[0]).toMatch(/^id: /);
    expect(lines[1]).toMatch(/^event: /);
    expect(lines[2]).toMatch(/^data: /);
    expect(lines[3]).toBe(""); // first \n of \n\n
    expect(lines[4]).toBe(""); // second \n of \n\n
  });

  it("data JSON does NOT include the type field (already in event: line)", () => {
    const event = createAgentEvent("agent.message", { role: "assistant", content: "hi" });
    const wire = formatSSE(event);
    const dataLine = wire.split("\n").find((l) => l.startsWith("data: "))!;
    const payload = JSON.parse(dataLine.slice("data: ".length));
    // Per formatSSE implementation: data only has { timestamp, data }
    expect(payload).not.toHaveProperty("type");
    expect(payload).toHaveProperty("timestamp");
    expect(payload).toHaveProperty("data");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AgentEventBus
// ─────────────────────────────────────────────────────────────────────────────

// Import separately so we can test the class behaviour in isolation.
// We import the singleton for simplicity (no constructor export needed).
vi.mock("encore.dev/pubsub", () => {
  class Topic {
    publish = vi.fn();
  }
  return { Topic };
});

// Dynamic import after the mock is set up
const getAgentEventBus = async () => {
  const mod = await import("../event-bus");
  return mod.agentEventBus;
};

describe("AgentEventBus", () => {
  it("emits events to subscribers", async () => {
    const bus = await getAgentEventBus();
    const received: AgentEvent[] = [];
    const unsub = bus.subscribe("task-emit-1", (e) => received.push(e));

    const event = createAgentEvent("agent.heartbeat", { ts: 1 });
    bus.emit("task-emit-1", event);

    unsub();
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(event.id);
  });

  it("does not deliver to unsubscribed listeners", async () => {
    const bus = await getAgentEventBus();
    const received: AgentEvent[] = [];
    const unsub = bus.subscribe("task-unsub-2", (e) => received.push(e));
    unsub();

    bus.emit("task-unsub-2", createAgentEvent("agent.heartbeat", { ts: 1 }));
    expect(received).toHaveLength(0);
  });

  it("buffers events up to BUFFER_SIZE", async () => {
    const bus = await getAgentEventBus();
    const taskId = "task-buffer-3";

    for (let i = 0; i < 5; i++) {
      bus.emit(taskId, createAgentEvent("agent.heartbeat", { ts: i }));
    }

    const buffer = bus.getBuffer(taskId);
    expect(buffer.length).toBe(5);
  });

  it("getBuffer returns [] for unknown taskId", async () => {
    const bus = await getAgentEventBus();
    expect(bus.getBuffer("nonexistent-task-9999")).toEqual([]);
  });

  it("cleanup removes listeners and clears buffer", async () => {
    const bus = await getAgentEventBus();
    const taskId = "task-cleanup-4";

    bus.emit(taskId, createAgentEvent("agent.heartbeat", { ts: 0 }));
    expect(bus.getBuffer(taskId).length).toBeGreaterThan(0);

    bus.cleanup(taskId);
    expect(bus.getBuffer(taskId)).toEqual([]);

    // After cleanup, emitting should not throw
    expect(() =>
      bus.emit(taskId, createAgentEvent("agent.heartbeat", { ts: 1 })),
    ).not.toThrow();
  });

  it("multiple subscribers on same taskId all receive events", async () => {
    const bus = await getAgentEventBus();
    const taskId = "task-multi-5";
    const r1: AgentEvent[] = [];
    const r2: AgentEvent[] = [];

    const u1 = bus.subscribe(taskId, (e) => r1.push(e));
    const u2 = bus.subscribe(taskId, (e) => r2.push(e));

    bus.emit(taskId, createAgentEvent("agent.status", { status: "planning" }));

    u1();
    u2();

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it("events on different taskIds are isolated", async () => {
    const bus = await getAgentEventBus();
    const received: AgentEvent[] = [];
    const unsub = bus.subscribe("task-iso-A", (e) => received.push(e));

    bus.emit("task-iso-B", createAgentEvent("agent.heartbeat", { ts: 99 }));
    unsub();

    expect(received).toHaveLength(0);
  });
});
