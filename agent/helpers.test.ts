import { describe, it, expect, vi, beforeEach } from "vitest";
import { audit, auditedStep, checkCancelled, shouldStopTask, report, think, REPO_OWNER, REPO_NAME, MAX_RETRIES, MAX_PLAN_REVISIONS } from "./helpers";
import type { AgentExecutionContext } from "./types";

// Mock ~encore/clients
vi.mock("~encore/clients", () => ({
  github: { getTree: vi.fn(), findRelevantFiles: vi.fn(), getFile: vi.fn(), createPR: vi.fn() },
  linear: { updateTask: vi.fn() },
  memory: { search: vi.fn() },
  sandbox: { destroy: vi.fn() },
  tasks: {
    isCancelled: vi.fn().mockResolvedValue({ cancelled: false }),
    getTaskInternal: vi.fn().mockResolvedValue({ task: { status: "in_progress" } }),
    createTask: vi.fn(),
    updateTaskStatus: vi.fn(),
  },
  mcp: { installed: vi.fn().mockResolvedValue({ servers: [] }) },
}));

// Mock chat agentReports
vi.mock("../chat/chat", () => ({
  agentReports: { publish: vi.fn().mockResolvedValue("msg-id") },
}));

// Mock db
vi.mock("./db", () => ({
  db: { exec: vi.fn().mockResolvedValue(undefined) },
}));

// Mock messages
vi.mock("./messages", () => ({
  serializeMessage: vi.fn((msg: unknown) => JSON.stringify(msg)),
  buildReportMessage: vi.fn((content: string, status: string) => ({ type: "report", content, status })),
  buildThoughtMessage: vi.fn((thought: string) => ({ type: "thought", thought })),
  buildStatusMessage: vi.fn((_phase: string, steps: unknown[]) => ({ type: "status", steps })),
  buildClarificationMessage: vi.fn(),
}));

// Mock circuit breaker
vi.mock("./circuit-breaker", () => ({
  aiBreaker: { call: vi.fn((fn: () => unknown) => fn()) },
  githubBreaker: { call: vi.fn((fn: () => unknown) => fn()) },
  sandboxBreaker: { call: vi.fn((fn: () => unknown) => fn()) },
}));

function createMockCtx(overrides?: Partial<AgentExecutionContext>): AgentExecutionContext {
  return {
    conversationId: "conv-1",
    taskId: "task-1",
    taskDescription: "Test task",
    userMessage: "Do something",
    repoOwner: "Twofold-AS",
    repoName: "thefold",
    branch: "main",
    modelMode: "auto",
    selectedModel: "claude-sonnet-4-5-20250929",
    totalCostUsd: 0,
    totalTokensUsed: 0,
    attemptHistory: [],
    errorPatterns: [],
    totalAttempts: 0,
    maxAttempts: 5,
    planRevisions: 0,
    maxPlanRevisions: 2,
    subAgentsEnabled: false,
    ...overrides,
  };
}

describe("helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("report should publish to agentReports", async () => {
    const { agentReports } = await import("../chat/chat");
    const ctx = createMockCtx();

    await report(ctx, "Progress update", "working");

    expect(agentReports.publish).toHaveBeenCalledOnce();
    expect(agentReports.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        taskId: "task-1",
        status: "working",
      }),
    );
  });

  it("think should publish thought to agentReports", async () => {
    const { agentReports } = await import("../chat/chat");
    const ctx = createMockCtx();

    await think(ctx, "Thinking about something...");

    expect(agentReports.publish).toHaveBeenCalledOnce();
    expect(agentReports.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        status: "working",
      }),
    );
  });

  it("auditedStep should log success and return result", async () => {
    const { db } = await import("./db");
    const ctx = createMockCtx();

    const result = await auditedStep(ctx, "test_action", { key: "value" }, async () => {
      return { answer: 42 };
    });

    expect(result).toEqual({ answer: 42 });
    expect(db.exec).toHaveBeenCalled();
  });

  it("auditedStep should log failure on error", async () => {
    const { db } = await import("./db");
    const ctx = createMockCtx();

    await expect(
      auditedStep(ctx, "test_action", { key: "value" }, async () => {
        throw new Error("Something broke");
      }),
    ).rejects.toThrow("Something broke");

    expect(db.exec).toHaveBeenCalled();
  });

  it("checkCancelled should return false when task is active", async () => {
    const ctx = createMockCtx();
    const result = await checkCancelled(ctx);
    expect(result).toBe(false);
  });

  it("checkCancelled should return true when task is cancelled", async () => {
    const { tasks } = await import("~encore/clients");
    (tasks.isCancelled as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cancelled: true });

    const ctx = createMockCtx();
    const result = await checkCancelled(ctx);
    expect(result).toBe(true);
  });

  it("shouldStopTask should return true for blocked tasks", async () => {
    const { tasks } = await import("~encore/clients");
    (tasks.isCancelled as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cancelled: false });
    (tasks.getTaskInternal as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ task: { status: "blocked" } });

    const ctx = createMockCtx({ thefoldTaskId: "task-1" });
    const result = await shouldStopTask(ctx, "building");
    expect(result).toBe(true);
  });

  it("shouldStopTask should return false for active tasks", async () => {
    const { tasks } = await import("~encore/clients");
    (tasks.isCancelled as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cancelled: false });
    (tasks.getTaskInternal as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ task: { status: "in_progress" } });

    const ctx = createMockCtx({ thefoldTaskId: "task-1" });
    const result = await shouldStopTask(ctx, "building");
    expect(result).toBe(false);
  });

  it("audit should insert into agent_audit_log", async () => {
    const { db } = await import("./db");

    await audit({
      sessionId: "sess-1",
      actionType: "test_audit",
      details: { foo: "bar" },
      success: true,
      taskId: "task-1",
    });

    expect(db.exec).toHaveBeenCalled();
  });

  it("should export correct constants", () => {
    expect(REPO_OWNER).toBe("Twofold-AS");
    expect(REPO_NAME).toBe("thefold");
    expect(MAX_RETRIES).toBe(5);
    expect(MAX_PLAN_REVISIONS).toBe(2);
  });
});
