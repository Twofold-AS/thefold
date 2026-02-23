import { describe, it, expect, vi } from "vitest";

// Mock Encore modules before dynamic imports trigger chat/chat.ts → encore runtime
vi.mock("~encore/clients", () => ({
  github: { getTree: vi.fn(), getFile: vi.fn(), findRelevantFiles: vi.fn(), createPR: vi.fn() },
  linear: { updateTask: vi.fn(), getTask: vi.fn() },
  sandbox: { create: vi.fn(), validate: vi.fn(), destroy: vi.fn() },
  tasks: { updateTaskStatus: vi.fn(), isCancelled: vi.fn(() => ({ cancelled: false })) },
}));

vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn(() => ({ email: "test@test.com", userId: "test-user" })),
}));

vi.mock("encore.dev/pubsub", () => ({
  Topic: vi.fn().mockImplementation(function () { return { publish: vi.fn() }; }),
  Subscription: vi.fn(),
}));

vi.mock("encore.dev/config", () => ({
  secret: () => () => "false",
}));

describe("legacy cleanup", () => {
  it("agent-message-parser re-exports from agent/messages", async () => {
    const parser = await import("./agent-message-parser");
    expect(parser.deserializeProgress).toBeDefined();
    expect(parser.serializeProgress).toBeDefined();
  });

  it("legacy exports still available", async () => {
    const parser = await import("./agent-message-parser");
    expect(parser.deserializeMessage).toBeDefined();
    expect(parser.serializeMessage).toBeDefined();
  });

  it("no duplicate type definitions", async () => {
    const messages = await import("../agent/messages");
    const parser = await import("./agent-message-parser");
    // Both should reference the same functions
    expect(parser.deserializeProgress).toBe(messages.deserializeProgress);
  });

  it("chat-specific helpers are preserved", async () => {
    const parser = await import("./agent-message-parser");
    expect(parser.mapReportStatusToPhase).toBeDefined();
    expect(parser.buildStatusContent).toBeDefined();
  });

  it("mapReportStatusToPhase returns Norwegian UI labels", async () => {
    const parser = await import("./agent-message-parser");
    expect(parser.mapReportStatusToPhase("working")).toBe("Bygger");
    expect(parser.mapReportStatusToPhase("completed")).toBe("Ferdig");
    expect(parser.mapReportStatusToPhase("failed")).toBe("Feilet");
    expect(parser.mapReportStatusToPhase("needs_input")).toBe("Venter");
  });

  it("buildStatusContent produces valid JSON", async () => {
    const parser = await import("./agent-message-parser");
    const result = parser.buildStatusContent("Bygger", [
      { label: "Test step", status: "active" as const },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe("status");
    expect(parsed.phase).toBe("Bygger");
    expect(parsed.steps).toHaveLength(1);
  });

  it("useNewContract is re-exported from agent/messages", async () => {
    const messages = await import("../agent/messages");
    const parser = await import("./agent-message-parser");
    expect(parser.useNewContract).toBe(messages.useNewContract);
  });

  it("serializeMessage is re-exported from agent/messages", async () => {
    const messages = await import("../agent/messages");
    const parser = await import("./agent-message-parser");
    expect(parser.serializeMessage).toBe(messages.serializeMessage);
  });
});
