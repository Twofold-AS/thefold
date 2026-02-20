import { describe, it, expect, vi, beforeEach } from "vitest";
import { completeTask, type CompletionHelpers } from "./completion";
import { createPhaseTracker } from "./metrics";
import type { AgentExecutionContext } from "./types";

// --- Mock ~encore/clients ---
vi.mock("~encore/clients", () => ({
  github: {
    createPR: vi.fn(),
  },
  linear: {
    updateTask: vi.fn(),
  },
  memory: {
    store: vi.fn(),
  },
  sandbox: {
    destroy: vi.fn(),
  },
  tasks: {
    updateTaskStatus: vi.fn(),
  },
}));

import { github, memory, sandbox, tasks } from "~encore/clients";

// --- Mock ./db ---
vi.mock("./db", () => ({
  completeJob: vi.fn().mockResolvedValue(undefined),
  db: {},
  acquireRepoLock: vi.fn(),
  releaseRepoLock: vi.fn(),
  createJob: vi.fn(),
  startJob: vi.fn(),
  updateJobCheckpoint: vi.fn(),
  failJob: vi.fn(),
  findResumableJobs: vi.fn(),
  expireOldJobs: vi.fn(),
}));

// --- Mock ./metrics ---
vi.mock("./metrics", () => ({
  createPhaseTracker: vi.fn(() => ({
    start: vi.fn(),
    end: vi.fn(),
    recordAICall: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  })),
  savePhaseMetrics: vi.fn().mockResolvedValue(undefined),
}));

// --- Helpers ---

function createMockHelpers(overrides?: Partial<CompletionHelpers>): CompletionHelpers {
  return {
    report: vi.fn().mockResolvedValue(undefined),
    think: vi.fn().mockResolvedValue(undefined),
    reportSteps: vi.fn().mockResolvedValue(undefined),
    auditedStep: vi.fn().mockImplementation(
      (_ctx: unknown, _action: unknown, _details: unknown, fn: () => Promise<unknown>) => fn()
    ),
    audit: vi.fn().mockResolvedValue(undefined),
    updateLinearIfExists: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockCtx(overrides?: Partial<AgentExecutionContext>): AgentExecutionContext {
  return {
    conversationId: "test-conv-123",
    taskId: "test-task-456",
    taskDescription: "Build a login form",
    userMessage: "Please build auth",
    repoOwner: "testowner",
    repoName: "testrepo",
    branch: "main",
    modelMode: "auto",
    selectedModel: "claude-sonnet-4-5",
    totalCostUsd: 0.05,
    totalTokensUsed: 500,
    attemptHistory: [],
    errorPatterns: [],
    totalAttempts: 2,
    maxAttempts: 5,
    planRevisions: 0,
    maxPlanRevisions: 2,
    subAgentsEnabled: false,
    ...overrides,
  };
}

const MOCK_FILES = [
  { path: "auth.ts", content: "export function login() {}", action: "create" },
  { path: "index.ts", content: "import { login } from './auth';", action: "create" },
];

const MOCK_PR_RESPONSE = {
  url: "https://github.com/testowner/testrepo/pull/42",
  number: 42,
};

// --- Tests ---

describe("completeTask", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    (github.createPR as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PR_RESPONSE);
    (memory.store as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (sandbox.destroy as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (tasks.updateTaskStatus as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  // Test 1: PR created and URL returned
  it("should create PR and return prUrl", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await completeTask(
      ctx,
      {
        allFiles: MOCK_FILES,
        sandboxId: "sb-test-1",
        documentation: "## Auth Module\n\nLogin flow implemented.",
        memoriesExtracted: ["JWT pattern used"],
        memoryStrings: ["prev context"],
      },
      tracker,
      helpers,
    );

    expect(result.success).toBe(true);
    expect(result.prUrl).toBe("https://github.com/testowner/testrepo/pull/42");
    expect(result.filesChanged).toEqual(["auth.ts", "index.ts"]);
    expect(github.createPR).toHaveBeenCalledOnce();
  });

  // Test 2: memories stored from memoriesExtracted
  it("should store memories from memoriesExtracted", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    await completeTask(
      ctx,
      {
        allFiles: MOCK_FILES,
        sandboxId: "sb-test-1",
        documentation: "Docs",
        memoriesExtracted: ["Pattern A", "Pattern B"],
        memoryStrings: [],
      },
      tracker,
      helpers,
    );

    // memory.store is fire-and-forget — give it a tick to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(memory.store).toHaveBeenCalledTimes(2);
    expect(memory.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Pattern A",
        category: "decision",
        memoryType: "decision",
      })
    );
    expect(memory.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Pattern B",
        category: "decision",
        memoryType: "decision",
      })
    );
  });

  // Test 3: sandbox destroyed on completion
  it("should destroy sandbox on completion", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    await completeTask(
      ctx,
      {
        allFiles: MOCK_FILES,
        sandboxId: "sb-test-999",
        documentation: "",
        memoriesExtracted: [],
        memoryStrings: [],
      },
      tracker,
      helpers,
    );

    // sandbox.destroy is fire-and-forget
    await new Promise((r) => setTimeout(r, 10));

    expect(sandbox.destroy).toHaveBeenCalledWith({ sandboxId: "sb-test-999" });
  });

  // Test 4: sandbox destroy failure is non-fatal
  it("should handle sandbox destroy failure gracefully", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    (sandbox.destroy as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Container already removed")
    );

    // Should NOT throw even if sandbox.destroy rejects
    const result = await completeTask(
      ctx,
      {
        allFiles: MOCK_FILES,
        sandboxId: "sb-gone",
        documentation: "",
        memoriesExtracted: [],
        memoryStrings: [],
      },
      tracker,
      helpers,
    );

    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(result.success).toBe(true);
    expect(sandbox.destroy).toHaveBeenCalledOnce();
  });
});
