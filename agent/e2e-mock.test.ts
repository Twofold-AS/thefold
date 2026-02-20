/**
 * E2E Mock Tests — Agent flow med mock AI provider
 *
 * Disse testene kjører hele agent-flyten uten eksterne API-nøkler.
 * Mock-systemet intercepter alle AI-, GitHub-, Memory- og Sandbox-kall.
 *
 * Kjør med: encore test ./agent/e2e-mock.test.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import {
  clearMockCallLog,
  getMockCallLog,
  mockAssessConfidence,
  mockAssessComplexity,
  mockPlanTask,
  mockCodeReview,
  mockDecomposeProject,
} from "./test-helpers/mock-ai";
import {
  mockGitHubTree,
  mockGitHubFile,
  mockMemorySearch,
  mockDocsLookup,
  mockMCPInstalled,
  mockSandboxCreate,
  mockSandboxValidate,
  mockSandboxDestroy,
  mockBuilderStart,
  mockGitHubCreatePR,
  mockCurateContext,
} from "./test-helpers/mock-services";
import type { AgentExecutionContext } from "./types";

const agentDb = new SQLDatabase("agent", { migrations: "./migrations" });

// Mock ~encore/clients (cross-service calls)
vi.mock("~encore/clients", () => ({
  ai: {
    assessConfidence: vi.fn(mockAssessConfidence),
    assessComplexity: vi.fn(mockAssessComplexity),
    planTask: vi.fn(mockPlanTask),
    decomposeProject: vi.fn(mockDecomposeProject),
    callForExtraction: vi.fn(() => ({ components: [] })),
    generateFile: vi.fn(() => ({ content: "// Mock generated", tokensUsed: 200, modelUsed: "mock", costUsd: 0.001 })),
    fixFile: vi.fn(() => ({ content: "// Mock fixed", tokensUsed: 150, modelUsed: "mock", costUsd: 0.001 })),
    reviewCode: vi.fn(mockCodeReview),
  },
  github: {
    getTree: vi.fn(mockGitHubTree),
    getFile: vi.fn((req: { path: string }) => mockGitHubFile(req.path)),
    getFileMetadata: vi.fn(() => ({ exists: true, size: 500 })),
    getFileChunk: vi.fn(() => ({ content: "// chunk", totalLines: 50, startLine: 1, endLine: 50 })),
    findRelevantFiles: vi.fn(() => ({ files: ["agent/types.ts"] })),
    createPR: vi.fn(mockGitHubCreatePR),
    createBranch: vi.fn(() => ({ success: true })),
    commitFiles: vi.fn(() => ({ sha: "mock-sha-123" })),
  },
  memory: {
    search: vi.fn(mockMemorySearch),
    store: vi.fn(() => ({ id: "mock-memory-stored" })),
    searchPatterns: vi.fn(() => ({ patterns: [] })),
  },
  docs: {
    lookupForTask: vi.fn(mockDocsLookup),
  },
  mcp: {
    installed: vi.fn(mockMCPInstalled),
    callTool: vi.fn(() => ({ result: { content: [{ type: "text", text: "mock" }] } })),
  },
  sandbox: {
    create: vi.fn(mockSandboxCreate),
    validate: vi.fn(mockSandboxValidate),
    validateIncremental: vi.fn(() => ({ success: true, errors: [] })),
    writeFile: vi.fn(() => ({ written: true })),
    deleteFile: vi.fn(() => ({ deleted: true })),
    destroy: vi.fn(mockSandboxDestroy),
    runCommand: vi.fn(() => ({ stdout: "", stderr: "", exitCode: 0 })),
  },
  builder: {
    start: vi.fn(mockBuilderStart),
    getJob: vi.fn(() => ({ job: null })),
  },
  tasks: {
    getTaskInternal: vi.fn(() => ({ task: { id: "mock", title: "Mock task", description: "", status: "backlog" } })),
    updateTaskStatus: vi.fn(() => ({ success: true })),
  },
  linear: {
    updateTask: vi.fn(() => ({ success: true })),
    getTask: vi.fn(() => ({ task: null })),
  },
  registry: {
    register: vi.fn(() => ({ component: { id: "mock" } })),
    findForTask: vi.fn(() => ({ components: [] })),
  },
  skills: {
    resolve: vi.fn(() => ({
      result: {
        preRunResults: [],
        injectedPrompt: "",
        injectedSkillIds: [],
        tokensUsed: 0,
        postRunSkills: []
      }
    })),
    executePreRun: vi.fn(() => ({ results: [], approved: true })),
    executePostRun: vi.fn(() => ({ results: [] })),
    logResult: vi.fn(() => ({})),
  },
  cache: {
    getOrSetSkillsResolve: vi.fn(() => null),
  },
  users: {
    getUser: vi.fn(() => ({ user: { id: "mock-user", email: "test@test.com" } })),
  },
}));

// Mock secrets
vi.mock("encore.dev/config", () => ({
  secret: (name: string) => {
    const secrets: Record<string, string> = {
      AgentStateMachineStrict: "false",
      MCPRoutingEnabled: "false",
      RegistryExtractionEnabled: "false",
      SandboxAdvancedPipeline: "false",
      AgentPersistentJobs: "false",
    };
    return () => secrets[name] ?? "false";
  },
}));

// Mock auth (used by chat.ts which is imported by agent.ts)
vi.mock("~encore/auth", () => ({
  getAuthData: vi.fn(() => ({ email: "test@test.com", userId: "mock-user-id" })),
}));

// --- Helpers ---

function createTestContext(overrides?: Partial<AgentExecutionContext>): AgentExecutionContext {
  return {
    conversationId: `e2e-mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: `mock-task-${Date.now()}`,
    taskDescription: "Add a comment to the top of agent/types.ts explaining the module purpose",
    userMessage: "Add a comment to agent/types.ts",
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

// --- Setup ---

beforeEach(() => {
  clearMockCallLog();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// Test 1M: Enkel task-flyt (mock)
// ═══════════════════════════════════════════════════════════════

describe("Mock E2E Test 1: Enkel task-flyt", () => {
  it("should execute a simple task with mock AI", async () => {
    const { executeTask } = await import("./agent");
    const ctx = createTestContext();

    const result = await executeTask(ctx, {
      collectOnly: true,
      skipLinear: true,
      skipReview: true,
      taskDescription: ctx.taskDescription,
    });

    expect(result.success).toBe(true);
    expect(result.filesChanged).toBeDefined();
    expect(result.costUsd).toBeGreaterThanOrEqual(0);
    expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("should track cost and tokens", async () => {
    const { executeTask } = await import("./agent");
    const ctx = createTestContext();

    const result = await executeTask(ctx, {
      collectOnly: true,
      skipLinear: true,
      skipReview: true,
      taskDescription: ctx.taskDescription,
    });

    expect(typeof result.costUsd).toBe("number");
    expect(typeof result.tokensUsed).toBe("number");
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════
// Test 2M: Task med review-flyt (mock)
// ═══════════════════════════════════════════════════════════════

describe("Mock E2E Test 2: Task med review-flyt", () => {
  it("should complete or stop at review with mock AI", async () => {
    const { executeTask } = await import("./agent");
    const ctx = createTestContext({ taskDescription: "Add a comment to agent/db.ts" });

    const result = await executeTask(ctx, {
      skipLinear: true,
      taskDescription: ctx.taskDescription,
    });

    // Avhengig av mock-oppførsel: enten pending_review eller success
    expect(result.success).toBe(true);

    if (result.reviewId) {
      const reviewRow = await agentDb.queryRow<{ id: string; status: string }>`
        SELECT id, status FROM code_reviews WHERE id = ${result.reviewId}
      `;
      expect(reviewRow).toBeDefined();
      expect(["pending", "approved"]).toContain(reviewRow!.status);
    }
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════
// Test 3M: Prosjektdekomponering (mock)
// ═══════════════════════════════════════════════════════════════

describe("Mock E2E Test 3: Prosjektdekomponering", () => {
  it("should decompose a project with mock AI", () => {
    const result = mockDecomposeProject({
      userMessage: "Bygg en oppgaveapp",
      repoOwner: "Twofold-AS",
      repoName: "thefold",
    });

    expect(result.phases.length).toBeGreaterThanOrEqual(2);

    for (const phase of result.phases) {
      expect(phase.tasks.length).toBeGreaterThanOrEqual(1);
      expect(phase.name).toBeDefined();
      expect(phase.description).toBeDefined();

      for (const task of phase.tasks) {
        for (const depIdx of task.dependsOnIndices) {
          expect(depIdx).toBeGreaterThanOrEqual(0);
          expect(depIdx).toBeLessThan(result.estimatedTotalTasks);
        }
      }
    }

    const conventionTokens = Math.ceil(result.conventions.length / 4);
    expect(conventionTokens).toBeLessThan(2000);
  });

  it("should store project plan in database", async () => {
    const plan = await agentDb.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request, status, conventions)
      VALUES ('e2e-mock-decompose', 'Build a task app', 'planned', 'Use TypeScript strict')
      RETURNING id
    `;
    expect(plan!.id).toBeDefined();

    await agentDb.exec`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description, status)
      VALUES (${plan!.id}, 0, 0, 'Setup project', 'Init', 'pending')
    `;
    await agentDb.exec`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description, status)
      VALUES (${plan!.id}, 1, 0, 'Implement auth', 'Auth system', 'pending')
    `;

    const tasks: Array<{ title: string }> = [];
    const rows = agentDb.query<{ title: string }>`
      SELECT title FROM project_tasks WHERE project_id = ${plan!.id} ORDER BY phase, task_order
    `;
    for await (const row of rows) {
      tasks.push(row);
    }
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe("Setup project");
  });
});

// ═══════════════════════════════════════════════════════════════
// Test 4M: Context Curator (mock)
// ═══════════════════════════════════════════════════════════════

describe("Mock E2E Test 4: Context Curator", () => {
  it("should curate context with mock services", () => {
    const result = mockCurateContext();

    expect(result.curatedFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.curatedFiles[0].relevance).toBeGreaterThan(0);
    expect(result.reasoning).toBeDefined();
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it("should mock memory search with relevant results", () => {
    const result = mockMemorySearch();

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0].relevanceScore).toBeGreaterThan(0.5);
    expect(result.results[0].type).toBe("decision");
  });

  it("should mock GitHub tree for context building", () => {
    const result = mockGitHubTree();

    expect(result.tree.length).toBeGreaterThanOrEqual(2);
    expect(result.tree).toContain("agent/types.ts");
    expect(result.tree).toContain("package.json");
  });
});

// ═══════════════════════════════════════════════════════════════
// Mock call verification
// ═══════════════════════════════════════════════════════════════

describe("Mock AI call verification", () => {
  it("should log all mock calls for debugging", () => {
    mockAssessConfidence({ task: "test" });
    mockPlanTask({ task: "test" });
    mockCodeReview({ files: [] });

    const log = getMockCallLog();
    expect(log).toHaveLength(3);
    expect(log[0].endpoint).toBe("assessConfidence");
    expect(log[1].endpoint).toBe("planTask");
    expect(log[2].endpoint).toBe("codeReview");

    for (const call of log) {
      expect(call.timestamp).toBeGreaterThan(0);
    }
  });

  it("should clear call log between tests", () => {
    clearMockCallLog();
    expect(getMockCallLog()).toHaveLength(0);

    mockAssessConfidence({});
    expect(getMockCallLog()).toHaveLength(1);

    clearMockCallLog();
    expect(getMockCallLog()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Additional verification tests
// ═══════════════════════════════════════════════════════════════

describe("Mock E2E Test 3 (additional): Project decomposition validation", () => {
  it("should have conventions under 2000 tokens", () => {
    const result = mockDecomposeProject({
      userMessage: "Build a complete app",
      repoOwner: "Twofold-AS",
      repoName: "thefold",
    });

    const conventionTokens = Math.ceil(result.conventions.length / 4);
    expect(conventionTokens).toBeLessThan(2000);
  });

  it("should have valid dependsOnIndices", () => {
    const result = mockDecomposeProject({
      userMessage: "Build multi-phase project",
      repoOwner: "Twofold-AS",
      repoName: "thefold",
    });

    let taskIndex = 0;
    for (const phase of result.phases) {
      for (const task of phase.tasks) {
        for (const depIdx of task.dependsOnIndices) {
          expect(depIdx).toBeGreaterThanOrEqual(0);
          expect(depIdx).toBeLessThan(result.estimatedTotalTasks);
          expect(depIdx).toBeLessThan(taskIndex); // Dependencies must come before
        }
        taskIndex++;
      }
    }
  });
});
