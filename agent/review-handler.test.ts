import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleReview, type ReviewHelpers } from "./review-handler";
import { createPhaseTracker } from "./metrics";
import type { AgentExecutionContext } from "./types";

// --- Mock ~encore/clients ---
vi.mock("~encore/clients", () => ({
  ai: {
    reviewCode: vi.fn(),
  },
  sandbox: {
    validate: vi.fn(),
  },
  tasks: {
    updateTaskStatus: vi.fn(),
  },
}));

import { ai, sandbox, tasks } from "~encore/clients";

// --- Mock ./review ---
vi.mock("./review", () => ({
  submitReviewInternal: vi.fn(),
}));

import { submitReviewInternal } from "./review";

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

function createMockHelpers(overrides?: Partial<ReviewHelpers>): ReviewHelpers {
  return {
    report: vi.fn().mockResolvedValue(undefined),
    think: vi.fn().mockResolvedValue(undefined),
    reportSteps: vi.fn().mockResolvedValue(undefined),
    auditedStep: vi.fn().mockImplementation(
      (_ctx: unknown, _action: unknown, _details: unknown, fn: () => Promise<unknown>) => fn()
    ),
    audit: vi.fn().mockResolvedValue(undefined),
    shouldStopTask: vi.fn().mockResolvedValue(false),
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

const MOCK_REVIEW_RESPONSE = {
  documentation: "## Auth Module\n\nImplements login flow.",
  qualityScore: 8,
  concerns: ["No rate limiting on login"],
  memoriesExtracted: ["JWT pattern used for auth"],
  costUsd: 0.01,
  tokensUsed: 200,
};

const MOCK_VALIDATION_OUTPUT = { success: true, output: "" };

// --- Tests ---

describe("handleReview", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    (ai.reviewCode as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_REVIEW_RESPONSE);
    (sandbox.validate as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_VALIDATION_OUTPUT);
    (submitReviewInternal as ReturnType<typeof vi.fn>).mockResolvedValue({ reviewId: "review-abc-123" });
    (tasks.updateTaskStatus as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  // Test 1: AI review completed and quality score returned
  it("should perform AI review and return quality score", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await handleReview(
      ctx,
      { allFiles: MOCK_FILES, sandboxId: "sb-test-1", memoryStrings: ["JWT pattern"] },
      tracker,
      helpers,
      { skipReview: false },
    );

    expect(result.qualityScore).toBe(8);
    expect(result.documentation).toContain("Auth Module");
    expect(result.concerns).toHaveLength(1);
    expect(result.memoriesExtracted).toHaveLength(1);
    expect(ai.reviewCode).toHaveBeenCalledOnce();
    expect(ctx.totalCostUsd).toBe(0.01);
    expect(ctx.totalTokensUsed).toBe(200);
  });

  // Test 2: Submit for user review when skipReview=false
  it("should submit for user review and return shouldPause=true when skipReview=false", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await handleReview(
      ctx,
      { allFiles: MOCK_FILES, sandboxId: "sb-test-1", memoryStrings: [] },
      tracker,
      helpers,
    );

    expect(result.shouldPause).toBe(true);
    expect(result.skipReview).toBe(false);
    expect(result.reviewId).toBe("review-abc-123");
    expect(submitReviewInternal).toHaveBeenCalledOnce();
    expect(submitReviewInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "test-conv-123",
        taskId: "test-task-456",
        sandboxId: "sb-test-1",
      })
    );
  });

  // Test 3: Skip review submission when skipReview=true
  it("should skip review submission and return shouldPause=false when skipReview=true", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await handleReview(
      ctx,
      { allFiles: MOCK_FILES, sandboxId: "sb-test-1", memoryStrings: [] },
      tracker,
      helpers,
      { skipReview: true },
    );

    expect(result.shouldPause).toBe(false);
    expect(result.skipReview).toBe(true);
    expect(submitReviewInternal).not.toHaveBeenCalled();
    expect(ai.reviewCode).not.toHaveBeenCalled();
  });

  // Test 4: shouldStopTask returns true at pre_review checkpoint
  it("should respect shouldStopTask at pre_review checkpoint", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers({
      shouldStopTask: vi.fn().mockResolvedValueOnce(true),
    });
    const tracker = createPhaseTracker();

    const result = await handleReview(
      ctx,
      { allFiles: MOCK_FILES, sandboxId: "sb-test-1", memoryStrings: [] },
      tracker,
      helpers,
    );

    expect(result.earlyReturn).toBeDefined();
    expect(result.earlyReturn!.errorMessage).toBe("stopped");
    expect(result.earlyReturn!.success).toBe(false);
    // AI review should NOT have been called
    expect(ai.reviewCode).not.toHaveBeenCalled();
    expect(submitReviewInternal).not.toHaveBeenCalled();
  });

  // Test 5: shouldStopTask returns true at pre_submit_review (after AI review)
  it("should respect shouldStopTask at pre_submit_review checkpoint", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers({
      // First call (pre_review) = false, second call (pre_submit_review) = true
      shouldStopTask: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    });
    const tracker = createPhaseTracker();

    const result = await handleReview(
      ctx,
      { allFiles: MOCK_FILES, sandboxId: "sb-test-1", memoryStrings: [] },
      tracker,
      helpers,
    );

    expect(result.earlyReturn).toBeDefined();
    expect(result.earlyReturn!.errorMessage).toBe("stopped");
    // AI review WAS called (before the second stop check)
    expect(ai.reviewCode).toHaveBeenCalledOnce();
    // But submitReviewInternal was NOT called
    expect(submitReviewInternal).not.toHaveBeenCalled();
    // Review data is still returned (AI review completed)
    expect(result.qualityScore).toBe(8);
  });
});
