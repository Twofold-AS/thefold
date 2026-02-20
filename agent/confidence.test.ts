import { describe, it, expect, vi, beforeEach } from "vitest";
import { assessAndRoute, type ConfidenceHelpers } from "./confidence";
import { createPhaseTracker } from "./metrics";
import type { AgentExecutionContext } from "./types";

// --- Mock ~encore/clients ---
vi.mock("~encore/clients", () => ({
  ai: {
    assessConfidence: vi.fn(),
    assessComplexity: vi.fn(),
  },
  tasks: {
    updateTaskStatus: vi.fn(),
  },
}));

import { ai, tasks } from "~encore/clients";

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

// --- Mock ai/router ---
vi.mock("../ai/router", () => ({
  selectOptimalModel: vi.fn().mockReturnValue("claude-sonnet-4-5-20250929"),
}));

// --- Helpers ---

function createMockHelpers(overrides?: Partial<ConfidenceHelpers>): ConfidenceHelpers {
  return {
    report: vi.fn().mockResolvedValue(undefined),
    think: vi.fn().mockResolvedValue(undefined),
    reportSteps: vi.fn().mockResolvedValue(undefined),
    auditedStep: vi.fn().mockImplementation(
      (_ctx: unknown, _action: unknown, _details: unknown, fn: () => Promise<unknown>) => fn()
    ),
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockCtx(overrides?: Partial<AgentExecutionContext>): AgentExecutionContext {
  return {
    conversationId: "test-conv-123",
    taskId: "test-task-456",
    taskDescription: "Fix the login bug in auth.ts",
    userMessage: "Please fix auth",
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

const EMPTY_CONTEXT = {
  treeString: "",
  treeArray: [] as string[],
  relevantFiles: [] as Array<{ path: string; content: string }>,
  memoryStrings: [] as string[],
  docsStrings: [] as string[],
};

const POPULATED_CONTEXT = {
  treeString: "src/\n  auth.ts\n  index.ts\n",
  treeArray: ["src/auth.ts", "src/index.ts"],
  relevantFiles: [{ path: "src/auth.ts", content: "export function login() {}" }],
  memoryStrings: ["JWT token pattern used in this repo"],
  docsStrings: ["Express routing docs"],
};

// --- Tests ---

describe("assessAndRoute", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    // Default complexity result for model selection
    (ai.assessComplexity as ReturnType<typeof vi.fn>).mockResolvedValue({
      complexity: 5,
      reasoning: "Medium complexity task",
      suggestedModel: "claude-sonnet-4-5-20250929",
    });
  });

  // Test 1: Empty repo → auto 90% confidence, no AI calls
  it("should auto-approve empty repos with 90% confidence", async () => {
    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await assessAndRoute(ctx, EMPTY_CONTEXT, tracker, helpers);

    expect(result.shouldContinue).toBe(true);
    expect(result.confidenceScore).toBe(90);
    expect(ai.assessConfidence).not.toHaveBeenCalled();
    // Complexity should still be assessed for model selection
    expect(ai.assessComplexity).toHaveBeenCalled();
  });

  // Test 2: confidence >= 90 → shouldContinue: true
  it("should continue when confidence >= 90", async () => {
    (ai.assessConfidence as ReturnType<typeof vi.fn>).mockResolvedValue({
      confidence: {
        overall: 95,
        recommended_action: "proceed",
        uncertainties: [],
        clarifying_questions: [],
      },
    });

    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await assessAndRoute(ctx, POPULATED_CONTEXT, tracker, helpers);

    expect(result.shouldContinue).toBe(true);
    expect(result.confidenceScore).toBe(100); // non-empty repo with success = 100 returned
    expect(result.selectedModel).toBeDefined();
    expect(ai.assessConfidence).toHaveBeenCalledOnce();
  });

  // Test 3: confidence < 90 → pause for clarification
  it("should pause for clarification when confidence < 90", async () => {
    (ai.assessConfidence as ReturnType<typeof vi.fn>).mockResolvedValue({
      confidence: {
        overall: 45,
        recommended_action: "clarify",
        uncertainties: ["Unclear which auth library is used"],
        clarifying_questions: ["Which JWT library do you use?"],
      },
    });

    const ctx = createMockCtx({ thefoldTaskId: "thefold-task-789" });
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await assessAndRoute(ctx, POPULATED_CONTEXT, tracker, helpers);

    expect(result.shouldContinue).toBe(false);
    expect(result.pauseReason).toBe("low_confidence");
    expect(result.confidenceScore).toBe(45);
    expect(result.earlyReturn).toBeDefined();
    expect(result.earlyReturn!.success).toBe(false);
    expect(result.earlyReturn!.errorMessage).toBe("low_confidence");
    // reportSteps called with questions
    expect(helpers.reportSteps).toHaveBeenCalledWith(
      expect.anything(),
      "Venter",
      expect.arrayContaining([{ label: expect.stringContaining("45%"), status: "done" }]),
      expect.objectContaining({ questions: expect.any(Array) })
    );
    // tasks.updateTaskStatus called for thefoldTaskId
    expect(tasks.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "needs_input" })
    );
  });

  // Test 4: confidence >= 90 with break_down → suggest breakdown
  // Note: confidence < 90 always triggers "low_confidence" first (returns before breakdown check).
  // The breakdown path is reached only when confidence >= 90 AND recommended_action === "break_down".
  it("should suggest breakdown when confidence >= 90 with break_down action", async () => {
    (ai.assessConfidence as ReturnType<typeof vi.fn>).mockResolvedValue({
      confidence: {
        overall: 92,
        recommended_action: "break_down",
        uncertainties: [],
        clarifying_questions: [],
        suggested_subtasks: ["Update auth.ts", "Update types.ts", "Add tests"],
      },
    });

    const ctx = createMockCtx();
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await assessAndRoute(ctx, POPULATED_CONTEXT, tracker, helpers);

    expect(result.shouldContinue).toBe(false);
    expect(result.pauseReason).toBe("needs_breakdown");
    expect(result.confidenceScore).toBe(92);
    expect(result.earlyReturn!.errorMessage).toBe("needs_breakdown");
    // report called with breakdown message
    expect(helpers.report).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("komplekst"),
      "needs_input"
    );
  });

  // Test 5: forceContinue → skip all assessment
  it("should skip assessment when forceContinue is true", async () => {
    const ctx = createMockCtx({ selectedModel: "claude-opus-4-5" });
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await assessAndRoute(ctx, POPULATED_CONTEXT, tracker, helpers, { forceContinue: true });

    expect(result.shouldContinue).toBe(true);
    expect(result.confidenceScore).toBe(100);
    expect(ai.assessConfidence).not.toHaveBeenCalled();
    expect(ai.assessComplexity).not.toHaveBeenCalled();
    // Uses existing ctx.selectedModel
    expect(result.selectedModel).toBe("claude-opus-4-5");
  });

  // Test 6: modelOverride → skip complexity assessment
  it("should use modelOverride without complexity assessment", async () => {
    (ai.assessConfidence as ReturnType<typeof vi.fn>).mockResolvedValue({
      confidence: {
        overall: 92,
        recommended_action: "proceed",
        uncertainties: [],
        clarifying_questions: [],
      },
    });

    const ctx = createMockCtx({ modelOverride: "claude-opus-4-5" });
    const helpers = createMockHelpers();
    const tracker = createPhaseTracker();

    const result = await assessAndRoute(ctx, POPULATED_CONTEXT, tracker, helpers);

    expect(result.shouldContinue).toBe(true);
    expect(result.selectedModel).toBe("claude-opus-4-5");
    expect(ai.assessComplexity).not.toHaveBeenCalled();
  });
});
