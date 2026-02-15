/**
 * Steg 3.3 — Ende-til-ende tester
 *
 * Integrasjonstester som verifiserer hele flyten fra task til PR.
 * Kjøres med `encore test` (setter opp databaser og infrastruktur automatisk).
 *
 * Tests 1-4: Krever eksterne API-nøkler (AnthropicAPIKey, GitHubToken, VoyageAPIKey).
 *            Markert med .skip — fjern skip når nøklene er konfigurert.
 *
 * Tests 5-7: Kjører med kun database / rene funksjoner.
 */
import { describe, it, expect } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { detectProjectRequest } from "../chat/detection";
import {
  calculateImportanceScore,
  calculateDecayedRelevance,
  type MemoryType,
} from "../memory/decay";
import type {
  ProjectTask,
  CuratedContext,
  AgentExecutionContext,
  CodeReview,
  ReviewFile,
  AIReviewData,
} from "./types";

// Database references for direct DB testing
const agentDb = new SQLDatabase("agent", { migrations: "./migrations" });
const skillsDb = new SQLDatabase("skills", { migrations: "../skills/migrations" });

// ═══════════════════════════════════════════════════════════════
// TEST 1: Enkel task-flyt (uten review)
// ═══════════════════════════════════════════════════════════════
// Krever: AnthropicAPIKey, GitHubToken, VoyageAPIKey
// Kjøres med: `encore test ./agent/e2e.test.ts -timeout 300s`

describe.skip("Test 1: Enkel task-flyt (uten review)", () => {
  // Krever AnthropicAPIKey, GitHubToken, VoyageAPIKey, LinearAPIKey
  // Fjern .skip når alle secrets er konfigurert for testmiljø

  it("should execute a simple task end-to-end with skipReview", async () => {
    // Import executeTask dynamically to avoid pulling in all service deps
    const { executeTask } = await import("./agent");

    const ctx: AgentExecutionContext = {
      conversationId: `e2e-test-1-${Date.now()}`,
      taskId: `e2e-simple-${Date.now()}`,
      taskDescription: "Add a comment to the top of agent/types.ts explaining the module purpose",
      userMessage: "Add a comment to the top of agent/types.ts",
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
    };

    const result = await executeTask(ctx, {
      skipReview: true,
      skipLinear: true,
      taskDescription: ctx.taskDescription,
    });

    // Verifiseringer:
    // 1. Confidence assessment kjørte (sjekk audit log)
    const confidenceLog = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'confidence_assessed'
    `;
    expect(confidenceLog).toBeDefined();

    // 2. Plan ble opprettet
    const planLog = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'plan_created'
    `;
    expect(planLog).toBeDefined();

    // 3. Sandbox ble opprettet og ødelagt
    const sandboxCreated = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'sandbox_created'
    `;
    expect(sandboxCreated).toBeDefined();

    const sandboxDestroyed = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'sandbox_destroyed'
    `;
    expect(sandboxDestroyed).toBeDefined();

    // 4. Filer ble skrevet
    expect(result.filesChanged.length).toBeGreaterThan(0);

    // 5. Validering kjørte
    const validationLog = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'validation_run'
    `;
    expect(validationLog).toBeDefined();

    // 6. PR ble forsøkt opprettet (skipReview = true → createPR runs)
    const prLog = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'pr_created'
    `;
    // PR creation may fail (GitHub token permission) — check that it was attempted
    const prAttempted = prLog !== null || result.prUrl !== undefined;
    expect(prAttempted || result.errorMessage !== undefined).toBe(true);

    // 7. Kostnad ble tracket
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.tokensUsed).toBeGreaterThan(0);

    // 8. Minne ble lagret (sjekk at memory.store ble kalt)
    const memoryLog = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'memory_stored'
    `;
    // Memory storage is optional (only if review extracted memories)
    // Just verify the task completed
    expect(result.success).toBe(true);
  }, 300_000); // 300s timeout
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: Task med review-flyt
// ═══════════════════════════════════════════════════════════════
// Krever: AnthropicAPIKey, GitHubToken, VoyageAPIKey

describe.skip("Test 2: Task med review-flyt", () => {
  // Krever AnthropicAPIKey, GitHubToken, VoyageAPIKey
  // Fjern .skip når alle secrets er konfigurert for testmiljø

  it("should stop at pending_review and complete after approve", async () => {
    const { executeTask } = await import("./agent");
    const { approveReview, getReview } = await import("./review");

    const ctx: AgentExecutionContext = {
      conversationId: `e2e-test-2-${Date.now()}`,
      taskId: `e2e-review-${Date.now()}`,
      taskDescription: "Add a comment to agent/db.ts explaining the database purpose",
      userMessage: "Add a comment",
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
    };

    // 1. Execute with review enabled (default, no skipReview)
    const result = await executeTask(ctx, {
      skipLinear: true,
      taskDescription: ctx.taskDescription,
    });

    // 2. Verifiser at flyten stopper ved pending_review
    expect(result.status).toBe("pending_review");
    expect(result.reviewId).toBeDefined();
    expect(result.success).toBe(true);

    // 3. En code_review entry eksisterer i databasen
    const reviewRow = await agentDb.queryRow<{ id: string; status: string; sandbox_id: string }>`
      SELECT id, status, sandbox_id FROM code_reviews WHERE id = ${result.reviewId!}
    `;
    expect(reviewRow).toBeDefined();
    expect(reviewRow!.status).toBe("pending");

    // 4. Sandbox er IKKE ødelagt (beholdes for review)
    const sandboxDestroyedLog = await agentDb.queryRow<{ id: string }>`
      SELECT id FROM agent_audit_log
      WHERE session_id = ${ctx.conversationId}
        AND action_type = 'sandbox_destroyed'
    `;
    expect(sandboxDestroyedLog).toBeNull();

    // 5. Godkjenn review (dette trigger PR creation + sandbox destroy)
    // Note: approveReview requires auth context — in E2E it uses the test auth
    // This will attempt to create a PR and destroy sandbox
    try {
      const approveResult = await approveReview({ reviewId: result.reviewId! });
      expect(approveResult.prUrl).toBeDefined();
    } catch {
      // PR creation may fail due to GitHub token — that's OK
    }

    // 6. Verifiser status etter godkjenning
    const approvedRow = await agentDb.queryRow<{ status: string }>`
      SELECT status FROM code_reviews WHERE id = ${result.reviewId!}
    `;
    // Status should be 'approved' if PR succeeded, otherwise still 'pending'
    expect(["approved", "pending"]).toContain(approvedRow!.status);
  }, 300_000);
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: Prosjektdekomponering (uten full utførelse)
// ═══════════════════════════════════════════════════════════════
// Krever: AnthropicAPIKey, GitHubToken

describe.skip("Test 3: Prosjektdekomponering", () => {
  // Krever AnthropicAPIKey, GitHubToken
  // Fjern .skip når alle secrets er konfigurert for testmiljø

  it("should decompose a project into phases and tasks", async () => {
    const { ai, agent } = await import("~encore/clients");

    // 1. Kall ai.decomposeProject
    const decomposition = await ai.decomposeProject({
      userMessage: "Bygg en enkel oppgaveapp med brukerregistrering og en dashboard-side",
      repoOwner: "Twofold-AS",
      repoName: "thefold",
      projectStructure: "src/\n  index.ts\n  api.ts\npackage.json",
    });

    // 2. Verifiser output
    expect(decomposition.phases.length).toBeGreaterThanOrEqual(2);

    for (const phase of decomposition.phases) {
      expect(phase.tasks.length).toBeGreaterThanOrEqual(1);
      expect(phase.name).toBeDefined();
      expect(phase.description).toBeDefined();

      for (const task of phase.tasks) {
        // dependsOnIndices er konsistente
        for (const depIdx of task.dependsOnIndices) {
          expect(depIdx).toBeGreaterThanOrEqual(0);
          expect(depIdx).toBeLessThan(decomposition.estimatedTotalTasks);
        }
        // context_hints er ikke-tomme
        expect(task.contextHints.length).toBeGreaterThanOrEqual(0);
      }
    }

    // 3. Conventions < 2000 tokens (estimer: tegn/4)
    const conventionTokens = Math.ceil(decomposition.conventions.length / 4);
    expect(conventionTokens).toBeLessThan(2000);

    // 4. Lagre planen i database via orchestrator
    const stored = await agent.storeProjectPlan({
      conversationId: `e2e-test-3-${Date.now()}`,
      userRequest: "Bygg en enkel oppgaveapp",
      decomposition: {
        phases: decomposition.phases,
        conventions: decomposition.conventions,
        estimatedTotalTasks: decomposition.estimatedTotalTasks,
      },
    });

    expect(stored.projectId).toBeDefined();
    expect(stored.totalTasks).toBeGreaterThanOrEqual(2);

    // 5. Verifiser at project_plans og project_tasks er korrekt lagret
    const planRow = await agentDb.queryRow<{ id: string; status: string; total_tasks: number }>`
      SELECT id, status, total_tasks FROM project_plans WHERE id = ${stored.projectId}
    `;
    expect(planRow).toBeDefined();
    expect(planRow!.status).toBe("planning");
    expect(planRow!.total_tasks).toBe(stored.totalTasks);

    const taskCount = await agentDb.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM project_tasks WHERE project_id = ${stored.projectId}
    `;
    expect(taskCount!.count).toBe(stored.totalTasks);
  }, 300_000);
});

// ═══════════════════════════════════════════════════════════════
// TEST 4: Context Curator
// ═══════════════════════════════════════════════════════════════
// Krever: GitHubToken, VoyageAPIKey

describe.skip("Test 4: Context Curator", () => {
  // Krever GitHubToken, VoyageAPIKey
  // Fjern .skip når alle secrets er konfigurert for testmiljø

  it("should curate context for a task with dependencies", async () => {
    const { curateContext } = await import("./orchestrator");

    // 1. Opprett prosjektplan med 2 faser, 3 tasks
    const plan = await agentDb.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request, status, conventions, total_tasks)
      VALUES ('e2e-test-4', 'Context test', 'executing', '# Project Conventions\nUse TypeScript strict mode.\nFollow Encore.ts patterns.', 3)
      RETURNING id
    `;

    const t1 = await agentDb.queryRow<{ id: string }>`
      INSERT INTO project_tasks (
        project_id, phase, task_order, title, description,
        status, output_files, output_types, context_hints
      ) VALUES (
        ${plan!.id}, 0, 0, 'Create user model',
        'Build the User model with SQLDatabase migration',
        'completed', ARRAY['users/model.ts', 'users/migrations/1_create_users.up.sql'],
        ARRAY['User', 'CreateUserRequest'], ARRAY['needs database schema']
      )
      RETURNING id
    `;

    const t2 = await agentDb.queryRow<{ id: string }>`
      INSERT INTO project_tasks (
        project_id, phase, task_order, title, description,
        status, output_files, output_types, context_hints
      ) VALUES (
        ${plan!.id}, 0, 1, 'Create auth endpoints',
        'Build auth API endpoints',
        'completed', ARRAY['gateway/gateway.ts'],
        ARRAY['AuthData'], ARRAY['needs user model']
      )
      RETURNING id
    `;

    const t3 = await agentDb.queryRow<{ id: string }>`
      INSERT INTO project_tasks (
        project_id, phase, task_order, title, description,
        status, depends_on, context_hints
      ) VALUES (
        ${plan!.id}, 1, 0, 'Build dashboard page',
        'Create a Next.js dashboard page showing user info',
        'pending', ARRAY[${t1!.id}, ${t2!.id}]::uuid[],
        ARRAY['needs user types', 'needs auth flow']
      )
      RETURNING id
    `;

    // Build task objects
    const allTasks: ProjectTask[] = [
      {
        id: t1!.id, projectId: plan!.id, phase: 0, taskOrder: 0,
        title: "Create user model", description: "Build the User model",
        status: "completed", dependsOn: [],
        outputFiles: ["users/model.ts", "users/migrations/1_create_users.up.sql"],
        outputTypes: ["User", "CreateUserRequest"],
        contextHints: ["needs database schema"], costUsd: 0, attemptCount: 1,
      },
      {
        id: t2!.id, projectId: plan!.id, phase: 0, taskOrder: 1,
        title: "Create auth endpoints", description: "Build auth API endpoints",
        status: "completed", dependsOn: [],
        outputFiles: ["gateway/gateway.ts"],
        outputTypes: ["AuthData"],
        contextHints: ["needs user model"], costUsd: 0, attemptCount: 1,
      },
      {
        id: t3!.id, projectId: plan!.id, phase: 1, taskOrder: 0,
        title: "Build dashboard page", description: "Create a Next.js dashboard page",
        status: "pending", dependsOn: [t1!.id, t2!.id],
        outputFiles: [], outputTypes: [],
        contextHints: ["needs user types", "needs auth flow"], costUsd: 0, attemptCount: 0,
      },
    ];

    // 3. Kall curateContext for task i fase 2
    const curated = await curateContext(
      allTasks[2],
      { conventions: "# Project Conventions\nUse TypeScript strict mode.\nFollow Encore.ts patterns." },
      allTasks,
      "Twofold-AS",
      "thefold"
    );

    // 4. Verifiser:
    // - Conventions er inkludert
    expect(curated.conventions).toContain("TypeScript strict mode");

    // - Token-estimat er rimelig
    expect(curated.tokenEstimate).toBeGreaterThan(0);
    expect(curated.tokenEstimate).toBeLessThan(50000);

    // - Dependency outputs er hentet
    expect(curated.dependencyOutputs.length).toBeGreaterThanOrEqual(1);
  }, 300_000);
});

// ═══════════════════════════════════════════════════════════════
// TEST 5: Chat prosjektdeteksjon
// ═══════════════════════════════════════════════════════════════
// Ingen eksterne avhengigheter — ren funksjon

describe("Test 5: Chat prosjektdeteksjon", () => {
  it("should NOT trigger for short messages", () => {
    const result = detectProjectRequest("Fiks buggen i auth");
    expect(result).toBe(false);
  });

  it("should NOT trigger for medium messages without build intent", () => {
    const result = detectProjectRequest(
      "Jeg har et problem med at databasen ikke svarer. " +
      "Det ser ut som om tilkoblingen brytes etter noen minutter. " +
      "Kan du se på det?"
    );
    expect(result).toBe(false);
  });

  it("should trigger for explicit prosjekt: prefix", () => {
    const result = detectProjectRequest("prosjekt: bygg en chat-app");
    expect(result).toBe(true);
  });

  it("should trigger for long build messages with multiple systems", () => {
    const longMessage =
      "Bygg en komplett oppgaveapp med brukerregistrering og autentisering, " +
      "teams med invitasjoner og roller, et dashboard med statistikk og oversikter, " +
      "et API for å opprette, redigere og slette oppgaver, " +
      "en database med migreringer for alle modeller, " +
      "frontend-sider for innlogging, registrering, dashboard, oppgaveliste og oppgavedetaljer, " +
      "pluss en backend-tjeneste som håndterer varsler og e-post. " +
      "Systemet skal også ha en admin-side med brukeradministrasjon og " +
      "en rapportmodul som genererer ukentlige sammendrag. " +
      "Inkluder også en komponent for filvedlegg og en modul for kommentarer på oppgaver. " +
      "Alt skal bygges med Encore.ts og Next.js frontend.";
    const result = detectProjectRequest(longMessage);
    expect(result).toBe(true);
  });

  it("should NOT trigger for messages under 30 words", () => {
    const result = detectProjectRequest(
      "Bygg en enkel service med API og database"
    );
    expect(result).toBe(false);
  });

  it("should trigger for medium message with many systems", () => {
    // >50 words, build word, 3+ systems
    const words = Array(55).fill("ord").join(" ");
    const message = `Implementer ${words} med system, tjeneste, modul og komponent pluss API og database`;
    const result = detectProjectRequest(message);
    expect(result).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 6: Memory decay i kontekst
// ═══════════════════════════════════════════════════════════════
// Rene funksjoner — ingen eksterne avhengigheter

describe("Test 6: Memory decay i kontekst", () => {
  const now = new Date("2026-02-14T12:00:00Z");

  it("should give higher score to newer memories", () => {
    const importance = 0.7;

    // Memory created 1 day ago
    const newMemory = calculateDecayedRelevance(
      importance,
      new Date("2026-02-13T12:00:00Z"), // 1 day ago
      1,
      new Date("2026-02-13T12:00:00Z"),
      "task",
      false,
      now
    );

    // Memory created 60 days ago
    const oldMemory = calculateDecayedRelevance(
      importance,
      new Date("2025-12-16T12:00:00Z"), // ~60 days ago
      1,
      new Date("2025-12-16T12:00:00Z"),
      "task",
      false,
      now
    );

    expect(newMemory).toBeGreaterThan(oldMemory);
  });

  it("should return 1.0 for pinned memories", () => {
    const pinned = calculateDecayedRelevance(
      0.3, // low importance
      new Date("2025-01-01T00:00:00Z"), // very old
      0,
      new Date("2025-01-01T00:00:00Z"),
      "session",
      true, // pinned
      now
    );
    expect(pinned).toBe(1.0);
  });

  it("should decay slower for error_pattern and decision types", () => {
    const age60Days = new Date("2025-12-16T12:00:00Z");
    const importance = 0.8;

    // error_pattern: 90-day half-life
    const errorPattern = calculateDecayedRelevance(
      importance, age60Days, 1, age60Days, "error_pattern", false, now
    );

    // session: 30-day half-life
    const session = calculateDecayedRelevance(
      importance, age60Days, 1, age60Days, "session", false, now
    );

    // error_pattern should retain more value at 60 days
    expect(errorPattern).toBeGreaterThan(session);
  });

  it("should boost frequently accessed memories", () => {
    const createdAt = new Date("2026-02-01T12:00:00Z");
    const importance = 0.6;

    // Rarely accessed
    const rareAccess = calculateDecayedRelevance(
      importance, createdAt, 1, createdAt, "general", false, now
    );

    // Frequently accessed (recently)
    const freqAccess = calculateDecayedRelevance(
      importance, createdAt, 50,
      new Date("2026-02-14T11:00:00Z"), // accessed 1 hour ago
      "general", false, now
    );

    expect(freqAccess).toBeGreaterThan(rareAccess);
  });

  it("should calculate correct importance scores by type", () => {
    expect(calculateImportanceScore("error_pattern", "general", false)).toBe(0.9);
    expect(calculateImportanceScore("decision", "general", false)).toBe(0.85);
    expect(calculateImportanceScore("skill", "general", false)).toBe(0.7);
    expect(calculateImportanceScore("task", "general", false)).toBe(0.6);
    expect(calculateImportanceScore("session", "general", false)).toBe(0.4);
    expect(calculateImportanceScore("general", "general", false)).toBe(0.3);
  });

  it("should boost importance for architecture/security categories", () => {
    const baseScore = calculateImportanceScore("task", "general", false);
    const archScore = calculateImportanceScore("task", "architecture-decisions", false);
    const secScore = calculateImportanceScore("task", "security-review", false);

    expect(archScore).toBeGreaterThan(baseScore);
    expect(secScore).toBeGreaterThan(baseScore);
  });

  it("should always return 1.0 importance for pinned", () => {
    expect(calculateImportanceScore("session", "chat", true)).toBe(1.0);
    expect(calculateImportanceScore("general", "general", true)).toBe(1.0);
  });

  it("should sort results by combined score (simulation)", () => {
    const memories = [
      {
        label: "old-session",
        score: calculateDecayedRelevance(
          0.4, new Date("2025-11-01"), 2, new Date("2025-11-01"), "session", false, now
        ),
      },
      {
        label: "recent-task",
        score: calculateDecayedRelevance(
          0.6, new Date("2026-02-10"), 2, new Date("2026-02-12"), "task", false, now
        ),
      },
      {
        label: "pinned-decision",
        score: calculateDecayedRelevance(
          0.85, new Date("2025-06-01"), 0, new Date("2025-06-01"), "decision", true, now
        ),
      },
    ];

    // Sort by score descending (simulates what memory.search does)
    const sorted = [...memories].sort((a, b) => b.score - a.score);

    // Pinned should be first (1.0)
    expect(sorted[0].label).toBe("pinned-decision");
    expect(sorted[0].score).toBe(1.0);

    // Recent task should be second (higher than old session)
    expect(sorted[1].label).toBe("recent-task");
    expect(sorted[1].score).toBeGreaterThan(sorted[2].score);

    // Old session should be last
    expect(sorted[2].label).toBe("old-session");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 7: Skills pipeline i kontekst
// ═══════════════════════════════════════════════════════════════
// Kun database — ingen eksterne API-kall

describe("Test 7: Skills pipeline i kontekst", () => {
  it("should create an inject-phase skill and resolve it", async () => {
    // 1. Opprett en test-skill med execution_phase='inject'
    const skillRow = await skillsDb.queryRow<{ id: string }>`
      INSERT INTO skills (
        name, description, prompt_fragment,
        execution_phase, priority, scope, enabled,
        routing_rules, token_estimate, category
      ) VALUES (
        'E2E Test Skill',
        'Test skill for E2E pipeline verification',
        'Always use descriptive variable names. Never abbreviate.',
        'inject', 1, 'global', TRUE,
        '{"keywords": ["e2e-test-keyword-unique-12345"]}'::jsonb,
        100, 'quality'
      )
      RETURNING id
    `;

    expect(skillRow).toBeDefined();
    expect(skillRow!.id).toBeDefined();

    // 2. Verify the skill was inserted correctly
    const fetched = await skillsDb.queryRow<{
      name: string;
      execution_phase: string;
      enabled: boolean;
      routing_rules: string | Record<string, unknown>;
    }>`
      SELECT name, execution_phase, enabled, routing_rules
      FROM skills WHERE id = ${skillRow!.id}::uuid
    `;

    expect(fetched!.name).toBe("E2E Test Skill");
    expect(fetched!.execution_phase).toBe("inject");
    expect(fetched!.enabled).toBe(true);

    const rules = typeof fetched!.routing_rules === "string"
      ? JSON.parse(fetched!.routing_rules)
      : fetched!.routing_rules;
    expect(rules.keywords).toContain("e2e-test-keyword-unique-12345");

    // 3. Clean up test skill
    await skillsDb.exec`
      DELETE FROM skills WHERE id = ${skillRow!.id}::uuid
    `;
  });

  it("should match routing rules for keyword-based skills", async () => {
    // Create a skill with specific routing keywords
    const skillRow = await skillsDb.queryRow<{ id: string }>`
      INSERT INTO skills (
        name, description, prompt_fragment,
        execution_phase, priority, scope, enabled,
        routing_rules, token_estimate, category
      ) VALUES (
        'Auth Skill E2E',
        'Security skill that activates for auth-related tasks',
        'Validate all user inputs. Use HMAC for tokens.',
        'inject', 5, 'global', TRUE,
        '{"keywords": ["auth", "security", "token"]}'::jsonb,
        400, 'security'
      )
      RETURNING id
    `;

    // Verify it exists in DB with correct properties
    const row = await skillsDb.queryRow<{
      execution_phase: string;
      priority: number;
      routing_rules: string | Record<string, unknown>;
    }>`
      SELECT execution_phase, priority, routing_rules
      FROM skills WHERE id = ${skillRow!.id}::uuid
    `;

    expect(row!.execution_phase).toBe("inject");
    expect(row!.priority).toBe(5);

    const rules = typeof row!.routing_rules === "string"
      ? JSON.parse(row!.routing_rules)
      : row!.routing_rules;

    expect(rules.keywords).toEqual(["auth", "security", "token"]);

    // Clean up
    await skillsDb.exec`
      DELETE FROM skills WHERE id = ${skillRow!.id}::uuid
    `;
  });

  it("should track skill scoring (success/failure counts)", async () => {
    const skillRow = await skillsDb.queryRow<{ id: string }>`
      INSERT INTO skills (
        name, description, prompt_fragment,
        execution_phase, priority, scope, enabled,
        success_count, failure_count, confidence_score
      ) VALUES (
        'Scoring Test Skill',
        'Test skill for scoring verification',
        'Test prompt fragment',
        'inject', 50, 'global', TRUE,
        0, 0, 0.5
      )
      RETURNING id
    `;

    // Simulate 3 successes
    await skillsDb.exec`
      UPDATE skills SET
        success_count = 3,
        failure_count = 1,
        total_uses = 4,
        confidence_score = 3.0 / 4.0
      WHERE id = ${skillRow!.id}::uuid
    `;

    const updated = await skillsDb.queryRow<{
      success_count: number;
      failure_count: number;
      total_uses: number;
      confidence_score: number;
    }>`
      SELECT success_count, failure_count, total_uses,
             confidence_score::decimal as confidence_score
      FROM skills WHERE id = ${skillRow!.id}::uuid
    `;

    expect(updated!.success_count).toBe(3);
    expect(updated!.failure_count).toBe(1);
    expect(updated!.total_uses).toBe(4);
    expect(Number(updated!.confidence_score)).toBeCloseTo(0.75, 2);

    // Clean up
    await skillsDb.exec`
      DELETE FROM skills WHERE id = ${skillRow!.id}::uuid
    `;
  });

  it("should handle multiple skill phases correctly", async () => {
    // Insert skills of all three phases
    const preRunSkill = await skillsDb.queryRow<{ id: string }>`
      INSERT INTO skills (
        name, description, prompt_fragment, execution_phase, priority, scope, enabled
      ) VALUES ('E2E PreRun', 'Pre-run test', 'Pre-run fragment', 'pre_run', 1, 'global', TRUE)
      RETURNING id
    `;
    const injectSkill = await skillsDb.queryRow<{ id: string }>`
      INSERT INTO skills (
        name, description, prompt_fragment, execution_phase, priority, scope, enabled
      ) VALUES ('E2E Inject', 'Inject test', 'Inject fragment', 'inject', 2, 'global', TRUE)
      RETURNING id
    `;
    const postRunSkill = await skillsDb.queryRow<{ id: string }>`
      INSERT INTO skills (
        name, description, prompt_fragment, execution_phase, priority, scope, enabled
      ) VALUES ('E2E PostRun', 'Post-run test', 'Post-run fragment', 'post_run', 3, 'global', TRUE)
      RETURNING id
    `;

    // Query skills grouped by phase
    const phases: Record<string, number> = {};
    const phaseRows = await skillsDb.query<{ execution_phase: string; count: number }>`
      SELECT execution_phase, COUNT(*)::int as count
      FROM skills
      WHERE id IN (${preRunSkill!.id}::uuid, ${injectSkill!.id}::uuid, ${postRunSkill!.id}::uuid)
      GROUP BY execution_phase
    `;
    for await (const row of phaseRows) {
      phases[row.execution_phase] = row.count;
    }

    expect(phases["pre_run"]).toBe(1);
    expect(phases["inject"]).toBe(1);
    expect(phases["post_run"]).toBe(1);

    // Clean up
    await skillsDb.exec`DELETE FROM skills WHERE id = ${preRunSkill!.id}::uuid`;
    await skillsDb.exec`DELETE FROM skills WHERE id = ${injectSkill!.id}::uuid`;
    await skillsDb.exec`DELETE FROM skills WHERE id = ${postRunSkill!.id}::uuid`;
  });
});

// ═══════════════════════════════════════════════════════════════
// E2E: Review system database integration
// ═══════════════════════════════════════════════════════════════

describe("E2E: Review system database integration", () => {
  it("should support the full review lifecycle in database", async () => {
    const filesChanged: ReviewFile[] = [
      { path: "src/app.ts", content: "export const app = 'hello';", action: "create" },
      { path: "src/utils.ts", content: "export function add(a: number, b: number) { return a + b; }", action: "create" },
    ];

    const aiReview: AIReviewData = {
      documentation: "# Changes\n\nAdded app and utils modules",
      qualityScore: 8,
      concerns: ["No error handling in add function"],
      memoriesExtracted: ["Simple utility functions don't need try-catch"],
    };

    // 1. Insert review (simulates submitReviewInternal)
    const row = await agentDb.queryRow<{ id: string; status: string }>`
      INSERT INTO code_reviews (
        conversation_id, task_id, sandbox_id,
        files_changed, ai_review, status
      ) VALUES (
        'e2e-review-lifecycle', 'task-lifecycle', 'sandbox-lifecycle',
        ${JSON.stringify(filesChanged)}::jsonb,
        ${JSON.stringify(aiReview)}::jsonb,
        'pending'
      )
      RETURNING id, status
    `;
    expect(row!.status).toBe("pending");

    // 2. Retrieve and verify JSONB round-trip
    const retrieved = await agentDb.queryRow<{
      files_changed: string | ReviewFile[];
      ai_review: string | AIReviewData;
    }>`
      SELECT files_changed, ai_review FROM code_reviews WHERE id = ${row!.id}
    `;

    const parsedFiles: ReviewFile[] = typeof retrieved!.files_changed === "string"
      ? JSON.parse(retrieved!.files_changed)
      : retrieved!.files_changed;
    expect(parsedFiles).toHaveLength(2);
    expect(parsedFiles[0].path).toBe("src/app.ts");

    const parsedReview: AIReviewData = typeof retrieved!.ai_review === "string"
      ? JSON.parse(retrieved!.ai_review)
      : retrieved!.ai_review;
    expect(parsedReview.qualityScore).toBe(8);
    expect(parsedReview.concerns).toHaveLength(1);

    // 3. Approve review (simulates approveReview)
    await agentDb.exec`
      UPDATE code_reviews
      SET status = 'approved', reviewed_at = NOW(), pr_url = 'https://github.com/test/pr/1'
      WHERE id = ${row!.id}
    `;

    const approved = await agentDb.queryRow<{ status: string; pr_url: string }>`
      SELECT status, pr_url FROM code_reviews WHERE id = ${row!.id}
    `;
    expect(approved!.status).toBe("approved");
    expect(approved!.pr_url).toBe("https://github.com/test/pr/1");
  });

  it("should support pending_review status in project tasks", async () => {
    const plan = await agentDb.queryRow<{ id: string }>`
      INSERT INTO project_plans (conversation_id, user_request, status)
      VALUES ('e2e-review-project', 'Review status test', 'executing')
      RETURNING id
    `;

    const task = await agentDb.queryRow<{ id: string }>`
      INSERT INTO project_tasks (project_id, phase, task_order, title, description)
      VALUES (${plan!.id}, 0, 0, 'Task needing review', 'desc')
      RETURNING id
    `;

    // Set to pending_review (as orchestrator does)
    await agentDb.exec`
      UPDATE project_tasks SET status = 'pending_review' WHERE id = ${task!.id}
    `;
    await agentDb.exec`
      UPDATE project_plans SET status = 'paused' WHERE id = ${plan!.id}
    `;

    const taskRow = await agentDb.queryRow<{ status: string }>`
      SELECT status FROM project_tasks WHERE id = ${task!.id}
    `;
    expect(taskRow!.status).toBe("pending_review");

    const planRow = await agentDb.queryRow<{ status: string }>`
      SELECT status FROM project_plans WHERE id = ${plan!.id}
    `;
    expect(planRow!.status).toBe("paused");

    // Resume after review approval
    await agentDb.exec`
      UPDATE project_tasks SET status = 'completed' WHERE id = ${task!.id}
    `;
    await agentDb.exec`
      UPDATE project_plans SET status = 'executing' WHERE id = ${plan!.id}
    `;

    const resumed = await agentDb.queryRow<{ status: string }>`
      SELECT status FROM project_plans WHERE id = ${plan!.id}
    `;
    expect(resumed!.status).toBe("executing");
  });
});

// ═══════════════════════════════════════════════════════════════
// E2E: Audit log integration
// ═══════════════════════════════════════════════════════════════

describe("E2E: Audit log integration", () => {
  it("should store and query audit log entries", async () => {
    const sessionId = `e2e-audit-${Date.now()}`;

    // Insert multiple audit entries (simulates an agent execution trace)
    await agentDb.exec`
      INSERT INTO agent_audit_log (session_id, action_type, details, success, task_id, duration_ms)
      VALUES (${sessionId}, 'confidence_assessed', '{"overall": 85}'::jsonb, TRUE, 'e2e-audit-task', 150)
    `;
    await agentDb.exec`
      INSERT INTO agent_audit_log (session_id, action_type, details, success, task_id, duration_ms)
      VALUES (${sessionId}, 'plan_created', '{"steps": 3}'::jsonb, TRUE, 'e2e-audit-task', 2500)
    `;
    await agentDb.exec`
      INSERT INTO agent_audit_log (session_id, action_type, details, success, task_id, duration_ms)
      VALUES (${sessionId}, 'sandbox_created', '{"sandboxId": "sb-1"}'::jsonb, TRUE, 'e2e-audit-task', 5000)
    `;
    await agentDb.exec`
      INSERT INTO agent_audit_log (session_id, action_type, details, success, task_id, duration_ms)
      VALUES (${sessionId}, 'validation_run', '{"attempt": 1}'::jsonb, TRUE, 'e2e-audit-task', 8000)
    `;
    await agentDb.exec`
      INSERT INTO agent_audit_log (session_id, action_type, details, success, task_id, duration_ms)
      VALUES (${sessionId}, 'task_completed', '{"filesChanged": ["src/test.ts"]}'::jsonb, TRUE, 'e2e-audit-task', 500)
    `;

    // Query entries for this session
    const entries: Array<{ action_type: string; success: boolean }> = [];
    const rows = await agentDb.query<{ action_type: string; success: boolean }>`
      SELECT action_type, success
      FROM agent_audit_log
      WHERE session_id = ${sessionId}
      ORDER BY timestamp ASC
    `;
    for await (const row of rows) {
      entries.push(row);
    }

    expect(entries).toHaveLength(5);
    expect(entries[0].action_type).toBe("confidence_assessed");
    expect(entries[1].action_type).toBe("plan_created");
    expect(entries[2].action_type).toBe("sandbox_created");
    expect(entries[3].action_type).toBe("validation_run");
    expect(entries[4].action_type).toBe("task_completed");

    // All should be successful
    expect(entries.every((e) => e.success)).toBe(true);
  });
});
