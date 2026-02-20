# 📋 PROMPT XS — E2E-tester med Mock AI Provider

## ⚠️ OBLIGATORISK: Les og bruk Encore Skills FØR du skriver kode

Du har installert Encore Skills (`encoredev/skills`). Disse SKAL brukes aktivt.

---

## STEG 0 — Les disse filene FØRST

**Skills å lese:**
- `encore-testing` (for alle tester — VIKTIGST for denne prompten)
- `encore-api` (for forståelse av endpoints som testes)
- `encore-code-review` (kjør etter fullført implementering)

**Prosjektfiler å lese:**
- `CLAUDE.md` — Hele filen, spesielt agent-flyten, AI-kall, review-system
- `X-PROSJEKT-PLAN.md` — XS-seksjonen
- `agent/e2e.test.ts` — **Les hele filen nøye.** Forstå de 4 skippede testene (Test 1-4) og de 21 kjørende testene (Test 5-10)
- `agent/agent.ts` — executeTask() for å forstå flyten som mockes
- `agent/types.ts` — AgentExecutionContext, DiagnosisResult, etc.
- `agent/context-builder.ts` — buildContext() som kaller GitHub, Memory, Docs, MCP
- `agent/confidence.ts` — assessAndRoute() som kaller ai.assessConfidence
- `agent/execution.ts` — executePlan() som kaller ai.planTask, builder.start
- `agent/review-handler.ts` — handleReview() som kaller AI for code review
- `agent/completion.ts` — completeTask() som lager PR, lagrer memory
- `ai/ai.ts` — callAIWithFallback, assessConfidence, assessComplexity, planTask, decomposeProject
- `agent/orchestrator.ts` — curateContext, executeProject

---

## BAKGRUNN

De 4 viktigste E2E-testene (full agent-loop, review-flyt, prosjektdekomponering, context curator) er **markert med `describe.skip`** fordi de krever ekte API-nøkler (Anthropic, GitHub, Voyage). Dette betyr at **kjerneflyten aldri har automatisert testing**.

**Mål:** Lag et mock AI-provider system som erstatter ekte API-kall i testmiljø. De 4 testene skal kjøre uten eksterne API-nøkler og verifisere at hele flyten fungerer korrekt.

**Strategi:** Opprett en `MockAIProvider` som intercepter AI-kall og returnerer forutsigbare svar. Mock også GitHub og Memory for å unngå alle eksterne avhengigheter.

---

## DEL 1 — Mock AI Provider

Opprett `agent/test-helpers/mock-ai.ts`:

```typescript
// agent/test-helpers/mock-ai.ts

/**
 * Mock-svar for AI-kall brukt i E2E-tester.
 * Returnerer deterministiske svar som simulerer ekte AI-oppførsel.
 */

export interface MockAICall {
  endpoint: string;
  input: Record<string, unknown>;
  response: Record<string, unknown>;
  timestamp: number;
}

// Logg alle mock-kall for assertions i tester
const mockCallLog: MockAICall[] = [];

export function getMockCallLog(): MockAICall[] {
  return [...mockCallLog];
}

export function clearMockCallLog(): void {
  mockCallLog.length = 0;
}

/**
 * Mock-svar for assessConfidence
 */
export function mockAssessConfidence(_input: Record<string, unknown>) {
  mockCallLog.push({
    endpoint: "assessConfidence",
    input: _input,
    response: { overallConfidence: 92, reasoning: "Mock: Task is well-defined" },
    timestamp: Date.now(),
  });

  return {
    overallConfidence: 92,
    reasoning: "Mock: Task is well-defined and straightforward",
    missingContext: [],
    suggestedApproach: "Direct implementation",
    estimatedComplexity: "low",
  };
}

/**
 * Mock-svar for assessComplexity
 */
export function mockAssessComplexity(_input: Record<string, unknown>) {
  mockCallLog.push({
    endpoint: "assessComplexity",
    input: _input,
    response: { complexity: "low", filesAffected: 1 },
    timestamp: Date.now(),
  });

  return {
    complexity: "low",
    reasoning: "Mock: Simple single-file change",
    filesAffected: 1,
    estimatedTokens: 2000,
    suggestedModel: "claude-sonnet-4-5-20250929",
  };
}

/**
 * Mock-svar for planTask
 */
export function mockPlanTask(_input: Record<string, unknown>) {
  const plan = {
    description: "Mock plan: Add comment to file",
    steps: [
      {
        action: "modify_file" as const,
        filePath: "agent/types.ts",
        description: "Add module documentation comment",
        content: "/**\n * Agent types module.\n */\n\n// Original content preserved",
      },
    ],
  };

  mockCallLog.push({
    endpoint: "planTask",
    input: _input,
    response: plan,
    timestamp: Date.now(),
  });

  return plan;
}

/**
 * Mock-svar for AI code review
 */
export function mockCodeReview(_input: Record<string, unknown>) {
  const review = {
    documentation: "# Mock Review\n\nChanges look good.",
    qualityScore: 8,
    concerns: [],
    memoriesExtracted: ["Adding documentation comments improves maintainability"],
  };

  mockCallLog.push({
    endpoint: "codeReview",
    input: _input,
    response: review,
    timestamp: Date.now(),
  });

  return review;
}

/**
 * Mock-svar for decomposeProject
 */
export function mockDecomposeProject(_input: Record<string, unknown>) {
  const result = {
    phases: [
      {
        name: "Setup",
        description: "Project initialization",
        tasks: [
          {
            title: "Create project structure",
            description: "Set up base files and configuration",
            contextHints: ["package.json", "tsconfig.json"],
            dependsOnIndices: [],
            estimatedComplexity: "low",
          },
        ],
      },
      {
        name: "Implementation",
        description: "Core feature implementation",
        tasks: [
          {
            title: "Implement user registration",
            description: "Add auth endpoints",
            contextHints: ["users/", "gateway/"],
            dependsOnIndices: [0],
            estimatedComplexity: "medium",
          },
          {
            title: "Build dashboard page",
            description: "Create dashboard UI",
            contextHints: ["frontend/src/app/"],
            dependsOnIndices: [0],
            estimatedComplexity: "medium",
          },
        ],
      },
    ],
    conventions: "Use TypeScript strict mode. Follow Encore.ts patterns.",
    estimatedTotalTasks: 3,
  };

  mockCallLog.push({
    endpoint: "decomposeProject",
    input: _input,
    response: result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Mock callAIWithFallback — det sentrale interceptet.
 */
export function mockCallAIWithFallback(params: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
}) {
  const content = params.messages[0]?.content ?? "";

  mockCallLog.push({
    endpoint: "callAIWithFallback",
    input: { model: params.model, contentPreview: content.substring(0, 200) },
    response: { content: "Mock AI response" },
    timestamp: Date.now(),
  });

  return {
    content: "Mock AI response: Task completed successfully.",
    tokensUsed: 500,
    modelUsed: params.model,
    costEstimate: { totalCost: 0.001 },
  };
}
```

---

## DEL 2 — Mock GitHub og Memory providers

Opprett `agent/test-helpers/mock-services.ts`:

```typescript
// agent/test-helpers/mock-services.ts

/**
 * Mock-svar for eksterne services (GitHub, Memory, Docs, MCP, Sandbox)
 * brukt i E2E-tester uten ekte API-nøkler.
 */

export function mockGitHubTree() {
  return {
    tree: [
      "agent/types.ts",
      "agent/agent.ts",
      "package.json",
      "tsconfig.json",
    ],
  };
}

export function mockGitHubFile(filePath: string) {
  const mockFiles: Record<string, string> = {
    "agent/types.ts": "export interface AgentExecutionContext { /* ... */ }",
    "package.json": JSON.stringify({ name: "thefold", dependencies: { "encore.dev": "^1.0.0" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
  };

  return {
    content: mockFiles[filePath] ?? `// Mock content for ${filePath}`,
    encoding: "utf-8",
  };
}

export function mockMemorySearch() {
  return {
    results: [
      {
        id: "mock-memory-1",
        content: "TypeScript strict mode is used throughout the project",
        type: "decision",
        relevanceScore: 0.85,
      },
    ],
  };
}

export function mockDocsLookup() {
  return {
    docs: [
      {
        source: "encore.ts",
        content: "Use api() from encore.dev/api for all endpoints",
      },
    ],
  };
}

export function mockMCPInstalled() {
  return { servers: [] };
}

export function mockSandboxCreate() {
  return { id: `mock-sandbox-${Date.now()}` };
}

export function mockSandboxValidate() {
  return {
    success: true,
    output: "=== TYPECHECK ===\nNo errors\n\n=== LINT ===\nNo errors\n\n=== TEST ===\nNo errors\n\nPipeline duration: 1234ms",
    errors: [],
  };
}

export function mockSandboxDestroy() {
  return { destroyed: true };
}

export function mockBuilderStart() {
  return {
    success: true,
    filesChanged: [
      { path: "agent/types.ts", action: "modify" },
    ],
    tokensUsed: 1500,
    costUsd: 0.002,
    buildIterations: 1,
  };
}

export function mockGitHubCreatePR() {
  return {
    prUrl: "https://github.com/Twofold-AS/thefold/pull/999",
    prNumber: 999,
  };
}

export function mockCurateContext() {
  return {
    curatedFiles: [
      { path: "agent/types.ts", content: "// Mock curated content", relevance: 0.95 },
    ],
    reasoning: "Mock: Selected files based on task description",
    tokenEstimate: 500,
  };
}
```

---

## DEL 3 — Opprett ny E2E-testfil med mocks

Opprett `agent/e2e-mock.test.ts`. **VIKTIG: Ikke endre e2e.test.ts.**

Mock-strategien avhenger av import-mønsteret i koden. Les agent.ts, context-builder.ts, etc. og finn ut om de bruker:
- `~encore/clients` (cross-service) → mock med `vi.mock("~encore/clients")`
- Direkte imports (f.eks. `import { planTask } from "../ai/ai"`) → mock med `vi.mock("../ai/ai")`

**Tilpass mockene deretter.** Eksempel med `~encore/clients`:

```typescript
// agent/e2e-mock.test.ts

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

// Mock ~encore/clients (tilpass basert på faktisk import-mønster!)
vi.mock("~encore/clients", () => ({
  ai: {
    assessConfidence: vi.fn(mockAssessConfidence),
    assessComplexity: vi.fn(mockAssessComplexity),
    planTask: vi.fn(mockPlanTask),
    decomposeProject: vi.fn(mockDecomposeProject),
    callForExtraction: vi.fn(() => ({ components: [] })),
    generateFile: vi.fn(() => ({ content: "// Mock generated", tokensUsed: 200, modelUsed: "mock", costUsd: 0.001 })),
    fixFile: vi.fn(() => ({ content: "// Mock fixed", tokensUsed: 150, modelUsed: "mock", costUsd: 0.001 })),
  },
  github: {
    getTree: vi.fn(mockGitHubTree),
    getFile: vi.fn((_req: any) => mockGitHubFile(_req.path)),
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
  docs: { lookupForTask: vi.fn(mockDocsLookup) },
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
    get: vi.fn(() => ({ task: null })),
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
    resolve: vi.fn(() => ({ result: { preRunResults: [], injectedPrompt: "", injectedSkillIds: [], tokensUsed: 0, postRunSkills: [] } })),
    executePreRun: vi.fn(() => ({ results: [], approved: true })),
    executePostRun: vi.fn(() => ({ results: [] })),
    logResult: vi.fn(() => ({})),
  },
  cache: { getOrSetSkillsResolve: vi.fn(() => null) },
}));

// Mock secrets
vi.mock("encore.dev/config", () => ({
  secret: (name: string) => {
    const secrets: Record<string, string> = {
      AgentStateMachineStrict: "false",
      MCPRoutingEnabled: "false",
      RegistryExtractionEnabled: "false",
      SandboxAdvancedPipeline: "false",
    };
    return () => secrets[name] ?? "false";
  },
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
```

---

## DEL 4 — Verifiser at eksisterende E2E-tester fortsatt kjører

De eksisterende 21 testene i `agent/e2e.test.ts` skal **ikke** påvirkes. Mock-testene er i en separat fil. Kjør begge:

```bash
encore test ./agent/e2e.test.ts
encore test ./agent/e2e-mock.test.ts
```

---

## FILER SOM OPPRETTES/ENDRES

**Nye filer:**
- `agent/test-helpers/mock-ai.ts` — Mock AI-provider med call logging
- `agent/test-helpers/mock-services.ts` — Mock GitHub, Memory, Sandbox, etc.
- `agent/e2e-mock.test.ts` — 12+ nye E2E-tester med mocks

**Endres IKKE:**
- `agent/e2e.test.ts` — `.skip`-tester beholdes uendret for fremtidig bruk med ekte nøkler

---

## KRAV

1. **Aldri bruk `process.env`, `dotenv`, eller `express`**
2. **Mocks i separate filer** under `test-helpers/`
3. **Kjører uten API-nøkler** — kun database
4. **e2e.test.ts endres IKKE**
5. **Mock call log for assertions** — verifiser at riktige endepunkter kalles
6. **Deterministiske mock-svar** — forutsigbare, ingen randomness
7. **Vitest + `encore test`**
8. **Tilpass mock-strategi etter faktisk import-mønster** i agent-koden
9. **60s timeout per test**
10. **Cleanup mellom tester** — `clearMockCallLog()` + `vi.clearAllMocks()`

---

## TESTER (minimum 12)

1. Test 1M: Enkel task-flyt fullføres med mock AI
2. Test 1M: Cost og tokens trackes
3. Test 2M: Review-flyt fullføres eller stopper ved pending_review
4. Test 3M: Prosjektdekomponering — korrekt fasestruktur
5. Test 3M: Project plan lagres i database med tasks
6. Test 4M: Context curator returnerer relevante filer
7. Test 4M: Memory search returnerer resultater
8. Test 4M: GitHub tree returnerer filstruktur
9. Mock verification: Call log registrerer alle kall
10. Mock verification: Clear fungerer mellom tester
11. Test 3M: Conventions under 2000 tokens
12. Test 3M: DependsOnIndices er gyldige

---

## FEATURE FLAG

Ingen ny feature flag. Mock-systemet aktiveres automatisk via `vi.mock()` i testmiljø.

---

## ETTER FULLFØRING

1. Oppdater `X-PROSJEKT-PLAN.md`:
   - Sett XS status til ✅ med dato og notater
   - **Legg til oppsummering: "X-PROSJEKT KOMPLETT — alle 19 prompts (XA-XS) fullført"** 🎉
2. Oppdater `GRUNNMUR-STATUS.md`:
   - E2E Tester: Legg til Mock Test 1M-4M som 🟢
   - Oppdater totalt: "33+ bestått, 4 skippet (beholdt for ekte nøkler)"
3. Oppdater `CLAUDE.md`:
   - `agent/test-helpers/mock-ai.ts` og `mock-services.ts` i key files
   - `agent/e2e-mock.test.ts` i key files
4. Kjør `encore-code-review` for å verifisere
5. Kjør `encore test` for hele agent-servicen
6. Gi **SLUTTRAPPORT** for hele X-prosjektet:
   - ✅ Fullført: [alle 19 prompts XA-XS]
   - ⚠️ Delvis: [eventuelle gjenstående issues]
   - 🐛 Oppdagede bugs: [nye bugs funnet]
   - 📊 Statistikk: Totalt antall filer, tester, features aktivert
   - 🏆 X-prosjektet er komplett!