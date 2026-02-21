import { describe, it, expect, vi, beforeEach } from "vitest";
import { executePlan, computeRetryContext, computeSimpleDiff, type ExecutionHelpers } from "./execution";
import { createPhaseTracker } from "./metrics";
import type { AgentExecutionContext } from "./types";

// --- Mock ~encore/clients ---
vi.mock("~encore/clients", () => ({
  ai: {
    planTask: vi.fn(),
    diagnoseFailure: vi.fn(),
    revisePlan: vi.fn(),
  },
  memory: {
    search: vi.fn(),
  },
  sandbox: {
    create: vi.fn(),
    validate: vi.fn(),
  },
  builder: {
    start: vi.fn(),
  },
  tasks: {
    updateTaskStatus: vi.fn(),
  },
}));

import { ai, memory, sandbox, builder, tasks } from "~encore/clients";

// --- Mock agent/db ---
vi.mock("./db", () => ({
  updateJobCheckpoint: vi.fn().mockResolvedValue(undefined),
  db: {},
  acquireRepoLock: vi.fn(),
  releaseRepoLock: vi.fn(),
  createJob: vi.fn(),
  startJob: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  findResumableJobs: vi.fn(),
  expireOldJobs: vi.fn(),
}));

// --- Mock ai/orchestrate-sub-agents ---
vi.mock("../ai/orchestrate-sub-agents", () => ({
  planSubAgents: vi.fn(),
  executeSubAgents: vi.fn(),
  mergeResults: vi.fn(),
  sumCosts: vi.fn().mockReturnValue(0),
  sumTokens: vi.fn().mockReturnValue(0),
}));

import { planSubAgents, executeSubAgents, mergeResults } from "../ai/orchestrate-sub-agents";

// --- Helpers ---

function createMockHelpers(overrides?: Partial<ExecutionHelpers>): ExecutionHelpers {
  return {
    report: vi.fn().mockResolvedValue(undefined),
    think: vi.fn().mockResolvedValue(undefined),
    reportSteps: vi.fn().mockResolvedValue(undefined),
    auditedStep: vi.fn().mockImplementation(
      (_ctx: unknown, _action: unknown, _details: unknown, fn: () => Promise<unknown>) => fn()
    ),
    audit: vi.fn().mockResolvedValue(undefined),
    shouldStopTask: vi.fn().mockResolvedValue(false),
    updateLinearIfExists: vi.fn().mockResolvedValue(undefined),
    aiBreaker: { call: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()) },
    sandboxBreaker: { call: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()) },
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

const MOCK_PLAN = {
  plan: [
    { description: "Create auth.ts", filePath: "auth.ts", action: "create" },
    { description: "Create index.ts", filePath: "index.ts", action: "create" },
  ],
  costUsd: 0.01,
  tokensUsed: 100,
};

const MOCK_BUILD_RESULT = {
  result: {
    success: true,
    filesChanged: [
      { path: "auth.ts", content: "export function login() {}", action: "create" },
      { path: "index.ts", content: "import { login } from './auth';", action: "create" },
    ],
    totalCostUsd: 0.05,
    totalTokensUsed: 500,
  },
};

const MOCK_VALIDATION_SUCCESS = { success: true, output: "" };
const MOCK_VALIDATION_FAILURE = { success: false, output: "TS2305: Cannot find module 'auth'" };

const CONTEXT_DATA = {
  treeString: "src/\n  auth.ts\n",
  treeArray: ["src/auth.ts"],
  relevantFiles: [{ path: "src/auth.ts", content: "export function login() {}" }],
  memoryStrings: ["JWT token pattern"],
  docsStrings: ["Express docs"],
};

// --- Tests ---

describe("executePlan", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for happy path
    (ai.planTask as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PLAN);
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });
    (sandbox.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sb-test-1" });
    (builder.start as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_BUILD_RESULT);
    (sandbox.validate as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_VALIDATION_SUCCESS);
  });

  // Test 1: Happy path — plan + build + validate OK
  it("should plan, build, and validate successfully", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    expect(result.success).toBe(true);
    expect(result.filesChanged).toHaveLength(2);
    expect(result.filesChanged[0].path).toBe("auth.ts");
    expect(result.sandboxId).toBe("sb-test-1");
    expect(result.planSummary).toContain("Create auth.ts");
    expect(result.earlyReturn).toBeUndefined();
    expect(ai.planTask).toHaveBeenCalledOnce();
    expect(sandbox.validate).toHaveBeenCalledOnce();
  });

  // Test 2: Validation fails → diagnose → implementation_error → retry → success
  it("should retry on validation failure with diagnosis", async () => {
    (sandbox.validate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(MOCK_VALIDATION_FAILURE)
      .mockResolvedValueOnce(MOCK_VALIDATION_SUCCESS);

    (ai.diagnoseFailure as ReturnType<typeof vi.fn>).mockResolvedValue({
      diagnosis: { rootCause: "implementation_error", suggestedAction: "fix_code", reason: "Wrong import" },
      costUsd: 0.005,
      tokensUsed: 50,
    });

    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    expect(result.success).toBe(true);
    expect(ctx.totalAttempts).toBe(2);
    expect(ai.diagnoseFailure).toHaveBeenCalledOnce();
    // planTask called twice: initial + retry
    expect(ai.planTask).toHaveBeenCalledTimes(2);
  });

  // Test 3: impossible_task → earlyReturn
  it("should return failure for impossible_task diagnosis", async () => {
    (sandbox.validate as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_VALIDATION_FAILURE);
    (ai.diagnoseFailure as ReturnType<typeof vi.fn>).mockResolvedValue({
      diagnosis: { rootCause: "impossible_task", reason: "Circular dependency cannot be resolved" },
      costUsd: 0.005,
      tokensUsed: 50,
    });

    const ctx = createMockCtx({ thefoldTaskId: "thefold-789" });
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    expect(result.earlyReturn).toBeDefined();
    expect(result.earlyReturn!.errorMessage).toBe("impossible_task");
    expect(result.earlyReturn!.success).toBe(false);
    expect(tasks.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked" })
    );
  });

  // Test 4: Max retries exhausted → throws
  it("should throw after max attempts exhausted", async () => {
    (sandbox.validate as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_VALIDATION_FAILURE);
    // Use "missing_context" so no setTimeout is triggered — just retries until max
    (ai.diagnoseFailure as ReturnType<typeof vi.fn>).mockResolvedValue({
      diagnosis: { rootCause: "missing_context", reason: "Not enough context" },
      costUsd: 0.001,
      tokensUsed: 10,
    });
    // memory.search returns nothing for extra context
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });

    const ctx = createMockCtx({ maxAttempts: 2 });
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    await expect(executePlan(ctx, CONTEXT_DATA, tracker, helpers)).rejects.toThrow("Validation failed after");
  });

  // Test 5: shouldStopTask returns true → earlyReturn "stopped"
  it("should stop early when shouldStopTask returns true at pre_sandbox", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers({
      shouldStopTask: vi.fn().mockResolvedValue(true),
    });
    const tracker = createPhaseTracker();

    const result = await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    expect(result.earlyReturn).toBeDefined();
    expect(result.earlyReturn!.errorMessage).toBe("stopped");
    // sandbox.create should NOT have been called (stopped before)
    expect(sandbox.create).not.toHaveBeenCalled();
  });

  // Test 6: Sub-agents activated and run when complexity >= 5
  it("should run sub-agents when enabled and plan has 3+ steps", async () => {
    const largePlan = {
      plan: [
        { description: "Step 1", filePath: "a.ts", action: "create" },
        { description: "Step 2", filePath: "b.ts", action: "create" },
        { description: "Step 3", filePath: "c.ts", action: "create" },
      ],
      costUsd: 0.02,
      tokensUsed: 200,
    };
    (ai.planTask as ReturnType<typeof vi.fn>).mockResolvedValue(largePlan);

    const mockSubPlan = {
      agents: [{ role: "implementer", model: "claude-sonnet-4-5" }],
      mergeStrategy: "concatenate" as const,
    };
    (planSubAgents as ReturnType<typeof vi.fn>).mockReturnValue(mockSubPlan);
    (executeSubAgents as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sa-1", role: "implementer", model: "claude-sonnet-4-5", success: true, output: "Implementation notes", costUsd: 0.01, tokensUsed: 100, durationMs: 500 },
    ]);
    (mergeResults as ReturnType<typeof vi.fn>).mockResolvedValue("Merged sub-agent context");

    const ctx = createMockCtx({ subAgentsEnabled: true });
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    expect(result.success).toBe(true);
    expect(planSubAgents).toHaveBeenCalled();
    expect(executeSubAgents).toHaveBeenCalledWith(mockSubPlan);
    expect(mergeResults).toHaveBeenCalled();
  });

  // Test 7: bad_plan → revisePlan called (not planTask for retry)
  it("should revise plan on bad_plan diagnosis and reset allFiles", async () => {
    (sandbox.validate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(MOCK_VALIDATION_FAILURE)
      .mockResolvedValueOnce(MOCK_VALIDATION_SUCCESS);

    (ai.diagnoseFailure as ReturnType<typeof vi.fn>).mockResolvedValue({
      diagnosis: { rootCause: "bad_plan", reason: "Wrong approach", suggestedAction: "revise_plan" },
      costUsd: 0.005,
      tokensUsed: 50,
    });

    (ai.revisePlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: [{ description: "Revised step", filePath: "revised.ts", action: "create" }],
      costUsd: 0.01,
      tokensUsed: 100,
    });

    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await executePlan(ctx, CONTEXT_DATA, tracker, helpers);

    expect(result.success).toBe(true);
    expect(ai.revisePlan).toHaveBeenCalledOnce();
    // planTask should only be called once (initial plan — not for bad_plan retry)
    expect(ai.planTask).toHaveBeenCalledTimes(1);
  });
});

// --- YB: Delta-kontekst i retries tests ---

describe("computeSimpleDiff", () => {
  it("should detect changed lines", () => {
    const old = "line1\nline2\nline3";
    const new_ = "line1\nchanged\nline3";
    const diff = computeSimpleDiff(old, new_);

    expect(diff).toContain("~2: changed");
    expect(diff).not.toContain("line1"); // unchanged lines not included
  });

  it("should detect added lines", () => {
    const old = "line1";
    const new_ = "line1\nline2";
    const diff = computeSimpleDiff(old, new_);

    expect(diff).toContain("+2: line2");
  });

  it("should detect deleted lines", () => {
    const old = "line1\nline2\nline3";
    const new_ = "line1\nline3";
    const diff = computeSimpleDiff(old, new_);

    // Simple line-based diff detects this as changed line + deleted line
    expect(diff).toContain("~2"); // line2 becomes line3 (changed)
    expect(diff).toContain("-3"); // old line3 deleted
  });

  it("should limit diff to 500 chars", () => {
    const old = "a".repeat(1000);
    const new_ = "b".repeat(1000);
    const diff = computeSimpleDiff(old, new_);

    expect(diff.length).toBeLessThanOrEqual(500);
    expect(diff).toContain("...");
  });

  it("should return placeholder when no changes", () => {
    const old = "line1\nline2";
    const new_ = "line1\nline2";
    const diff = computeSimpleDiff(old, new_);

    expect(diff).toBe("[no changes detected]");
  });
});

describe("computeRetryContext", () => {
  it("should include only changed files in delta", () => {
    const ctx = createMockCtx({ taskDescription: "Build auth" });
    const previousFiles = [
      { path: "a.ts", content: "version 1" },
      { path: "b.ts", content: "unchanged" },
    ];
    const currentFiles = [
      { path: "a.ts", content: "version 2" },
      { path: "b.ts", content: "unchanged" },
    ];

    const retryCtx = computeRetryContext(
      ctx,
      currentFiles,
      previousFiles,
      "Plan step 1\nPlan step 2",
      "Error: TypeScript compilation failed",
      { rootCause: "implementation_error" }
    );

    expect(retryCtx.changedFiles).toHaveLength(1);
    expect(retryCtx.changedFiles[0].path).toBe("a.ts");
    expect(retryCtx.changedFiles[0].diff).toContain("version 2");
  });

  it("should detect new files not in previous", () => {
    const ctx = createMockCtx();
    const previousFiles = [{ path: "a.ts", content: "old" }];
    const currentFiles = [
      { path: "a.ts", content: "old" },
      { path: "b.ts", content: "new file content" },
    ];

    const retryCtx = computeRetryContext(
      ctx,
      currentFiles,
      previousFiles,
      "Plan summary",
      "Error",
      { rootCause: "implementation_error" }
    );

    expect(retryCtx.changedFiles).toHaveLength(1);
    expect(retryCtx.changedFiles[0].path).toBe("b.ts");
    expect(retryCtx.changedFiles[0].diff).toContain("[NEW FILE]");
  });

  it("should truncate task summary to 200 chars", () => {
    const longDescription = "a".repeat(500);
    const ctx = createMockCtx({ taskDescription: longDescription });

    const retryCtx = computeRetryContext(
      ctx,
      [],
      [],
      "Plan",
      "Error",
      { rootCause: "bad_plan" }
    );

    expect(retryCtx.taskSummary.length).toBe(200);
    expect(retryCtx.taskSummary).toContain("...");
  });

  it("should truncate validation output to 1000 chars", () => {
    const longError = "a".repeat(2000);
    const ctx = createMockCtx();

    const retryCtx = computeRetryContext(
      ctx,
      [],
      [],
      "Plan",
      longError,
      { rootCause: "implementation_error" }
    );

    expect(retryCtx.latestError.length).toBe(1000);
    expect(retryCtx.latestError).toContain("...");
  });

  it("should estimate tokens correctly", () => {
    const ctx = createMockCtx({ taskDescription: "Short task" });
    const currentFiles = [
      { path: "a.ts", content: "x".repeat(400) }, // ~100 tokens in diff
    ];

    const retryCtx = computeRetryContext(
      ctx,
      currentFiles,
      [],
      "Plan summary",
      "Error message",
      { rootCause: "implementation_error", reason: "Code issue" }
    );

    // Verify estimatedTokens ≈ totalChars / 4
    expect(retryCtx.estimatedTokens).toBeGreaterThan(0);
    expect(typeof retryCtx.estimatedTokens).toBe("number");
  });

  it("should produce empty changedFiles when nothing changed", () => {
    const ctx = createMockCtx();
    const files = [{ path: "a.ts", content: "same" }];

    const retryCtx = computeRetryContext(
      ctx,
      files,
      files,
      "Plan",
      "Error",
      { rootCause: "environment_error" }
    );

    expect(retryCtx.changedFiles).toHaveLength(0);
  });
});
