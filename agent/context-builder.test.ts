import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContext, type ContextHelpers, type AgentContext } from "./context-builder";
import { createPhaseTracker } from "./metrics";
import type { AgentExecutionContext } from "./types";

// --- Mock ~encore/clients ---
// Since context-builder imports github/memory/docs/mcp via ~encore/clients,
// we mock these at the module level using vitest.mock

vi.mock("~encore/clients", () => ({
  github: {
    getTree: vi.fn(),
    findRelevantFiles: vi.fn(),
    getFile: vi.fn(),
    getFileMetadata: vi.fn(),
    getFileChunk: vi.fn(),
  },
  memory: {
    search: vi.fn(),
  },
  docs: {
    lookupForTask: vi.fn(),
  },
  mcp: {
    installed: vi.fn(),
  },
}));

// Import mocked clients for test setup
import { github, memory, docs, mcp } from "~encore/clients";

// --- Mock agent/db (updateJobCheckpoint) ---
vi.mock("./db", () => ({
  updateJobCheckpoint: vi.fn().mockResolvedValue(undefined),
  // Export other db functions as stubs to avoid import errors
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

// --- Helpers ---

function createMockHelpers(overrides?: Partial<ContextHelpers>): ContextHelpers {
  return {
    report: vi.fn().mockResolvedValue(undefined),
    think: vi.fn().mockResolvedValue(undefined),
    auditedStep: vi.fn().mockImplementation((_ctx: unknown, _action: unknown, _details: unknown, fn: () => Promise<unknown>) => fn()),
    audit: vi.fn().mockResolvedValue(undefined),
    autoInitRepo: vi.fn().mockResolvedValue(undefined),
    githubBreaker: { call: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()) },
    checkCancelled: vi.fn().mockResolvedValue(false),
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

function makeGetTree(empty = false) {
  return vi.fn().mockResolvedValue({
    treeString: empty ? "" : "src/\n  auth.ts\n  index.ts\n",
    tree: empty ? [] : [
      "src/auth.ts",
      "src/index.ts",
    ],
    packageJson: { dependencies: { express: "^4.18.0" } },
    empty,
  });
}

// --- Tests ---

describe("buildContext", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Happy path — returns AgentContext with all fields populated
  it("should return AgentContext with all fields populated", async () => {
    (github.getTree as ReturnType<typeof vi.fn>).mockResolvedValue({
      treeString: "src/\n  auth.ts\n",
      tree: ["src/auth.ts"],
      packageJson: { dependencies: { express: "^4.18.0" } },
      empty: false,
    });
    (github.findRelevantFiles as ReturnType<typeof vi.fn>).mockResolvedValue({ paths: ["src/auth.ts"] });
    (github.getFileMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({ totalLines: 50 });
    (github.getFile as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "export function login() {}" });
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ content: "JWT token pattern", accessCount: 3, createdAt: "2026-01-01" }],
    });
    (docs.lookupForTask as ReturnType<typeof vi.fn>).mockResolvedValue({
      docs: [{ source: "express", content: "Express routing docs" }],
    });
    (mcp.installed as ReturnType<typeof vi.fn>).mockResolvedValue({ servers: [] });

    const tracker = createPhaseTracker();
    const ctx = createMockCtx();
    const helpers = createMockHelpers();

    const result: AgentContext = await buildContext(ctx, tracker, helpers);

    expect(result.treeString).toContain("src/");
    expect(result.treeArray).toHaveLength(1);
    expect(result.treeArray[0]).toBe("src/auth.ts");
    expect(result.relevantFiles).toHaveLength(1);
    expect(result.relevantFiles[0].content).toBe("export function login() {}");
    expect(result.memoryStrings).toHaveLength(1);
    expect(result.memoryStrings[0]).toBe("JWT token pattern");
    expect(result.docsStrings).toHaveLength(1);
    expect(result.docsStrings[0]).toContain("express");
    expect(result.packageJson).toHaveProperty("dependencies");
  });

  // Test 2: GitHub getTree failure — graceful degradation
  it("should handle GitHub getTree failure gracefully", async () => {
    // auditedStep wraps getTree — mock auditedStep to throw on project_tree_read
    const helpers = createMockHelpers({
      auditedStep: vi.fn().mockImplementation(
        (_ctx: unknown, action: unknown, _details: unknown, fn: () => Promise<unknown>) => {
          if (action === "project_tree_read") throw new Error("GitHub API 503");
          return fn();
        }
      ),
    });

    const tracker = createPhaseTracker();
    const ctx = createMockCtx();

    // buildContext should throw here since getTree failure is unrecoverable
    // (no try/catch around it in the original code either)
    await expect(buildContext(ctx, tracker, helpers)).rejects.toThrow("GitHub API 503");
  });

  // Test 3: Memory search failure — graceful degradation
  it("should handle memory search failure gracefully (returns empty memoryStrings)", async () => {
    (github.getTree as ReturnType<typeof vi.fn>).mockResolvedValue({
      treeString: "src/\n",
      tree: ["src/index.ts"],
      packageJson: {},
      empty: false,
    });
    (github.findRelevantFiles as ReturnType<typeof vi.fn>).mockResolvedValue({ paths: [] });
    (memory.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Voyage 429 rate limit"));
    (docs.lookupForTask as ReturnType<typeof vi.fn>).mockResolvedValue({ docs: [] });
    (mcp.installed as ReturnType<typeof vi.fn>).mockResolvedValue({ servers: [] });

    const tracker = createPhaseTracker();
    const ctx = createMockCtx();
    const helpers = createMockHelpers();

    // Should NOT throw — memory failure is caught
    const result = await buildContext(ctx, tracker, helpers);

    expect(result.memoryStrings).toEqual([]);
    expect(result.treeArray).toHaveLength(1);
  });

  // Test 4: Docs lookup failure — graceful degradation
  it("should handle docs lookup failure gracefully (returns empty docsStrings)", async () => {
    (github.getTree as ReturnType<typeof vi.fn>).mockResolvedValue({
      treeString: "src/\n",
      tree: [],
      packageJson: {},
      empty: false,
    });
    (github.findRelevantFiles as ReturnType<typeof vi.fn>).mockResolvedValue({ paths: [] });
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });
    (docs.lookupForTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Context7 unavailable"));
    (mcp.installed as ReturnType<typeof vi.fn>).mockResolvedValue({ servers: [] });

    const tracker = createPhaseTracker();
    const ctx = createMockCtx();
    const helpers = createMockHelpers();

    // Should NOT throw — docs failure is caught
    const result = await buildContext(ctx, tracker, helpers);

    expect(result.docsStrings).toEqual([]);
    expect(result.memoryStrings).toEqual([]);
  });

  // Test 5: Auto-init for empty repo — autoInitRepo called when empty=true
  it("should call autoInitRepo for empty repos", async () => {
    const autoInitRepo = vi.fn().mockResolvedValue(undefined);

    // First call returns empty, second (after init) returns populated
    (github.getTree as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        treeString: "",
        tree: [],
        packageJson: {},
        empty: true,
      })
      .mockResolvedValueOnce({
        treeString: "index.ts\n",
        tree: ["index.ts"],
        packageJson: {},
        empty: false,
      });

    (github.findRelevantFiles as ReturnType<typeof vi.fn>).mockResolvedValue({ paths: [] });
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });
    (docs.lookupForTask as ReturnType<typeof vi.fn>).mockResolvedValue({ docs: [] });
    (mcp.installed as ReturnType<typeof vi.fn>).mockResolvedValue({ servers: [] });

    const helpers = createMockHelpers({ autoInitRepo });
    const tracker = createPhaseTracker();
    const ctx = createMockCtx();

    await buildContext(ctx, tracker, helpers);

    expect(autoInitRepo).toHaveBeenCalledOnce();
    expect(autoInitRepo).toHaveBeenCalledWith(ctx);
  });

  // Test 6: MCP tools are appended to docsStrings
  it("should append MCP tool list to docsStrings when servers are installed", async () => {
    (github.getTree as ReturnType<typeof vi.fn>).mockResolvedValue({
      treeString: "",
      tree: [],
      packageJson: {},
      empty: false,
    });
    (github.findRelevantFiles as ReturnType<typeof vi.fn>).mockResolvedValue({ paths: [] });
    (memory.search as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });
    (docs.lookupForTask as ReturnType<typeof vi.fn>).mockResolvedValue({ docs: [] });
    (mcp.installed as ReturnType<typeof vi.fn>).mockResolvedValue({
      servers: [
        { name: "filesystem", description: "Read/write files", category: "general" },
        { name: "puppeteer", description: "Browser automation", category: "code" },
      ],
    });

    const tracker = createPhaseTracker();
    const ctx = createMockCtx();
    const helpers = createMockHelpers();

    const result = await buildContext(ctx, tracker, helpers);

    const mcpEntry = result.docsStrings.find((s) => s.includes("[MCP Tools]"));
    expect(mcpEntry).toBeDefined();
    expect(mcpEntry).toContain("filesystem");
    expect(mcpEntry).toContain("puppeteer");
  });
});
