import log from "encore.dev/log";
import { secret } from "encore.dev/config";
import { agent, github, linear, memory, sandbox, tasks, ai, registry } from "~encore/clients";
import { agentReports } from "../chat/chat";
import { savePhaseMetrics } from "./metrics";
import { completeJob } from "./db";
import { validateAgentScope } from "./helpers";
import { updateDecisionCache, createDecisionEntry } from "./decision-cache";
import { getPatternRegex } from "./pattern-matcher";
import { runHooks } from "./hooks";
import { updateManifest as updateProjectManifest } from "./manifest";
import { recordRoutingPattern } from "./routing-patterns";
import { checkTokenAnomaly, checkCostAnomaly } from "./anomaly";
import type { AgentExecutionContext } from "./types";
import type { PhaseTracker } from "./metrics";

// --- Secrets ---

const RegistryExtractionEnabled = secret("RegistryExtractionEnabled");

// --- Types ---

export interface CompletionResult {
  success: boolean;
  prUrl?: string;
  filesChanged: string[];
  costUsd: number;
  tokensUsed: number;
}

export interface CompletionHelpers {
  report: (
    ctx: AgentExecutionContext,
    content: string,
    status: "working" | "completed" | "failed" | "needs_input",
    extra?: { prUrl?: string; filesChanged?: string[] }
  ) => Promise<void>;
  think: (ctx: AgentExecutionContext, thought: string) => Promise<void>;
  reportSteps: (
    ctx: AgentExecutionContext,
    phase: string,
    steps: Array<{ label: string; status: "active" | "done" | "error" | "info" }>,
    extra?: {
      title?: string;
      planProgress?: { current: number; total: number };
      tasks?: Array<{ id: string; title: string; status: string }>;
    }
  ) => Promise<void>;
  auditedStep: <T>(
    ctx: AgentExecutionContext,
    action: string,
    details: Record<string, unknown>,
    fn: () => Promise<T>
  ) => Promise<T>;
  audit: (opts: {
    sessionId: string;
    actionType: string;
    details: Record<string, unknown>;
    success: boolean;
    taskId?: string;
    repoName?: string;
    prUrl?: string;
  }) => Promise<void>;
  updateLinearIfExists: (ctx: AgentExecutionContext, msg: string, status: string) => Promise<void>;
}

/**
 * Auto-start tasks that depend on the completed task.
 * Checks that ALL dependencies (not just this one) are done before starting.
 */
export async function startDependentTasks(completedTaskId: string, conversationId: string, repoName?: string, repoOwner?: string): Promise<void> {
  try {
    const dependents = await tasks.listTasks({ limit: 50 });
    const waiting = dependents.tasks.filter((t: any) =>
      t.dependsOn?.includes(completedTaskId) &&
      ["backlog", "planned"].includes(t.status)
    );

    for (const dep of waiting) {
      // Check that ALL dependencies are done, not just this one
      let allDepsDone = true;
      if (dep.dependsOn && dep.dependsOn.length > 0) {
        for (const depId of dep.dependsOn) {
          if (depId === completedTaskId) continue;
          try {
            const depTask = await tasks.getTaskInternal({ id: depId });
            if (depTask.task.status !== "done") {
              allDepsDone = false;
              break;
            }
          } catch {
            allDepsDone = false;
            break;
          }
        }
      }

      if (allDepsDone) {
        log.info("Auto-starting dependent task", { taskId: dep.id, title: dep.title, triggeredBy: completedTaskId });
        try {
          await agent.startTask({
            taskId: dep.id,
            conversationId,
            repoName: dep.repo || repoName || "",
            repoOwner: repoOwner || undefined,
            userMessage: `Auto-startet: avhengighet "${completedTaskId}" er ferdig`,
          });
        } catch (e) {
          log.warn("Failed to auto-start dependent task", { taskId: dep.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  } catch (e) {
    log.warn("startDependentTasks failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * STEP 9-12: PR creation, Linear update, memory storage, sandbox cleanup.
 *
 * Called for the skipReview path (when options.skipReview=true).
 * In the future, approveReview() in review.ts can also call this instead of
 * duplicating the completion logic.
 */
export async function completeTask(
  ctx: AgentExecutionContext,
  completionData: {
    allFiles: Array<{ path: string; content: string; action: string }>;
    sandboxId: string;
    documentation: string;
    memoriesExtracted: string[];
    memoryStrings: string[];
  },
  tracker: PhaseTracker,
  helpers: CompletionHelpers,
): Promise<CompletionResult> {
  const { report, think, reportSteps, auditedStep, audit, updateLinearIfExists } = helpers;
  const { allFiles, sandboxId, documentation, memoriesExtracted } = completionData;

  tracker.start("completing");

  // === STEP 9: Create PR ===
  log.info("STEP 9: Creating PR");
  const branchName = `thefold/${ctx.taskId.toLowerCase().replace(/\s+/g, "-").substring(0, 60)}`;
  let prUrl = "";

  try {
    // Scope validation (ASI02): ensure PR targets the task's bound repo
    validateAgentScope(ctx, ctx.repoOwner, ctx.repoName);

    const pr = await auditedStep(ctx, "github_write", {
      operation: "createPR",
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      branch: branchName,
    }, () => github.createPR({
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      branch: branchName,
      title: `[TheFold] ${ctx.taskDescription.split("\n")[0].substring(0, 72)}`,
      body: documentation || "Auto-generated by TheFold",
      files: allFiles.map((f) => ({
        path: f.path,
        content: f.content,
        action: f.action as "create" | "modify" | "delete",
      })),
    }));
    prUrl = pr.url;
    log.info("STEP 9: PR created", { url: prUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("403") || msg.includes("not accessible")) {
      log.warn("PR creation failed — permission denied", { repo: ctx.repoName, error: msg });
    } else {
      log.warn("PR creation failed", { repo: ctx.repoName, error: msg });
    }
    // Non-fatal — task still completes, user can create PR manually
  }

  await reportSteps(ctx, "Ferdig", [
    { label: "Kode validert", status: "done" },
    { label: prUrl ? "PR opprettet" : "PR feilet", status: prUrl ? "done" : "error" },
    { label: "Oppdaterer status", status: "active" },
  ], { title: prUrl ? "PR opprettet" : "Fullfort uten PR" });

  // === STEP 9.5: Registry auto-extraction (fire-and-forget) ===
  log.info("STEP 9.5: Registry auto-extraction");
  try {
    const enabled = RegistryExtractionEnabled();
    if (enabled === "true" && allFiles.length >= 2) {
      // Fire-and-forget — don't wait for extraction to complete
      extractAndRegisterComponents({
        repo: `${ctx.repoOwner}/${ctx.repoName}`,
        files: allFiles.map((f) => ({ path: f.path, content: f.content })),
        taskDescription: ctx.taskDescription,
      }).catch((err) => log.warn("registry extraction background error", { error: String(err) }));

      await report(ctx, "🔍 Analyserer kode for gjenbrukbare komponenter...", "working");
    }
  } catch (extractErr) {
    // Aldri la extraction feile hele completion
    log.warn("registry extraction setup failed", { error: String(extractErr) });
  }

  // === STEP 10: Update Linear + task status ===
  log.info("STEP 10: Updating Linear and task status");
  await updateLinearIfExists(
    ctx,
    `TheFold fullforte oppgaven.${prUrl ? ` PR: ${prUrl}` : ""}\n\n${documentation}`,
    "done"
  );

  if (ctx.thefoldTaskId) {
    try {
      await tasks.updateTaskStatus({
        id: ctx.thefoldTaskId,
        status: "done",
        prUrl: prUrl || undefined,
      });
    } catch (err) {
      log.warn("updateTaskStatus to done failed", { error: err instanceof Error ? err.message : String(err) });
    }

    // Auto-start tasks that depend on this completed task
    await startDependentTasks(ctx.thefoldTaskId, ctx.conversationId, ctx.repoName, ctx.repoOwner);
  }

  await audit({
    sessionId: ctx.conversationId,
    actionType: "task_completed",
    details: {
      filesChanged: allFiles.map((f) => f.path),
      prUrl,
      totalAttempts: ctx.totalAttempts,
    },
    success: true,
    taskId: ctx.taskId,
    repoName: `${ctx.repoOwner}/${ctx.repoName}`,
    prUrl,
  });

  // === STEP 11: Store memories (fire-and-forget) ===
  log.info("STEP 11: Storing memories", { count: memoriesExtracted.length });
  for (const mem of memoriesExtracted) {
    memory.store({
      content: mem,
      category: "decision",
      linearTaskId: ctx.taskId,
      memoryType: "decision",
      sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
    }).catch((e: unknown) => log.warn("memory.store decision failed", { error: String(e) }));
  }

  // Store error patterns from attemptHistory
  for (const attempt of ctx.attemptHistory) {
    if (attempt.result === "failure" && attempt.error) {
      memory.store({
        content: `Error pattern in ${ctx.repoName}: ${attempt.error.substring(0, 500)}`,
        category: "error_pattern",
        linearTaskId: ctx.taskId,
        memoryType: "error_pattern",
        sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
      }).catch((e: unknown) => log.warn("memory.store error_pattern failed", { error: String(e) }));
    }
  }

  // === STEP 11.5: Store procedural memory (YE) ===
  // Only store strategy when: first-attempt success + high quality
  if (ctx.totalAttempts === 1 && allFiles.length >= 2) {
    log.info("STEP 11.5: Storing procedural memory (strategy)");

    // YE: Detect task pattern and extract successful steps
    const taskPattern = detectTaskPattern(ctx.taskDescription, allFiles);
    const successfulSteps = extractSuccessfulSteps(
      ctx.attemptHistory.map((a, i) => ({
        attemptNumber: i + 1,
        result: a.result,
        error: a.error,
      }))
    );

    if (successfulSteps.length > 0) {
      const strategyContent = [
        `Task pattern: ${taskPattern}`,
        `Repository: ${ctx.repoOwner}/${ctx.repoName}`,
        `Task: ${ctx.taskDescription.substring(0, 300)}`,
        `Successful approach (${successfulSteps.length} steps):`,
        ...successfulSteps.map((step, i) => `${i + 1}. ${step}`),
        `Files changed: ${allFiles.map((f) => f.path).join(", ")}`,
      ].join("\n");

      memory.store({
        content: strategyContent,
        category: taskPattern,
        linearTaskId: ctx.taskId,
        memoryType: "strategy",
        sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
        tags: [taskPattern, "first-attempt-success", "high-quality"],
      }).catch((e: unknown) => log.warn("memory.store strategy failed", { error: String(e) }));

      log.info("strategy memory stored", { pattern: taskPattern, steps: successfulSteps.length });
    }
  }

  // === STEP 11.6: Knowledge distillation (D14, fire-and-forget) ===
  // Distill learned rules only when the task succeeded with useful signal
  const qualityScore = ctx.totalAttempts > 1
    ? Math.max(3, 10 - ctx.totalAttempts)  // Score drops with more attempts
    : (allFiles.length >= 2 ? 8 : 6);       // First-attempt: higher quality
  maybeDistill(ctx, qualityScore).catch((err) =>
    log.warn("maybeDistill failed", { error: String(err) })
  );

  // === STEP 11.7: Phase-end hooks (D18) ===
  await runHooks("after:completed", {
    ctx,
    filesChanged: allFiles.map((f) => f.path),
    qualityScore,
  });

  // === STEP 12: Final report + sandbox cleanup ===
  log.info("STEP 12: Cleanup and final report");

  // Build rich completion message with file list, PR link, and tool stats
  const fileList = allFiles.map(f => {
    const icon = f.action === "create" ? "+" : f.action === "delete" ? "\u2212" : "~";
    return `  ${icon} ${f.path}`;
  }).join("\n");

  // Collect tool usage stats from context
  const toolStats = {
    memories: ctx.memoriesUsed ?? 0,
    skills: ctx.skillsUsed ?? 0,
    docs: ctx.docsUsed ?? 0,
    subAgents: ctx.subAgentResults?.length ?? 0,
    attempts: ctx.totalAttempts,
    planRevisions: ctx.planRevisions,
  };

  const toolLines = [
    `Minner: ${toolStats.memories}`,
    `Skills: ${toolStats.skills}`,
    `Docs: ${toolStats.docs}`,
    toolStats.subAgents > 0 ? `Sub-agenter: ${toolStats.subAgents}` : null,
    toolStats.attempts > 1 ? `Forsok: ${toolStats.attempts}` : null,
    toolStats.planRevisions > 0 ? `Plan-revisjoner: ${toolStats.planRevisions}` : null,
  ].filter(Boolean).join(" \u00b7 ");

  const completionMsg = [
    "Oppgave fullfort",
    "",
    prUrl ? `PR: ${prUrl}` : "PR ble ikke opprettet",
    "",
    `Filer (${allFiles.length}):`,
    fileList,
    "",
    `Verktoy: ${toolLines}`,
    `Kostnad: $${ctx.totalCostUsd.toFixed(4)} \u00b7 Tokens: ${ctx.totalTokensUsed.toLocaleString()}`,
  ].join("\n");

  await report(ctx, completionMsg, "completed", {
    prUrl: prUrl || undefined,
    filesChanged: allFiles.map((f) => f.path),
  });

  // Publish persistent completion message (stored as messageType "chat" in DB)
  await agentReports.publish({
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    content: completionMsg,
    status: "completed",
    prUrl: prUrl || undefined,
    filesChanged: allFiles.map((f) => f.path),
    completionMessage: completionMsg,
  });

  await reportSteps(ctx, "Ferdig", [
    { label: "Kode skrevet", status: "done" },
    { label: "Validert", status: "done" },
    { label: prUrl ? "PR opprettet" : "Fullfort", status: "done" },
    { label: "Ferdig", status: "done" },
  ], { title: "Oppgave fullfort" });

  await think(ctx, `Oppgaven er fullfort. ${allFiles.length} filer endret.${prUrl ? ` PR: ${prUrl}` : ""}`);

  // Destroy sandbox (fire-and-forget — non-critical)
  sandbox.destroy({ sandboxId }).catch(() => { /* Sandbox may already be destroyed */ });

  // Update project manifest with changed files (fire-and-forget — non-critical, D20)
  if (allFiles.length > 0) {
    updateProjectManifest(
      ctx.repoOwner,
      ctx.repoName,
      allFiles.map((f) => f.path)
    ).catch((err) =>
      log.warn("manifest update after task completion failed", { error: String(err) })
    );
  }

  // STEP 12.5: Stop MCP servers (fire-and-forget — non-critical)
  try {
    const { stopAllServers } = await import("../mcp/router");
    stopAllServers();
  } catch {
    // Non-critical
  }

  // === Decision cache update (D8) ===
  // Fast-path: update confidence score for the matched pattern
  if (ctx.fastPathPattern) {
    updateDecisionCache(ctx.fastPathPattern, true).catch((err) =>
      log.warn("updateDecisionCache fast-path failed", { error: String(err) })
    );
  } else if (ctx.totalAttempts === 1 && ctx.totalTokensUsed < 1000 && allFiles.length > 0) {
    // Standard-path trivial task: promote to decision cache as future fast-path candidate
    const taskDesc = ctx.taskDescription.toLowerCase();
    // Derive a simple regex from the first 5 meaningful words
    const words = taskDesc.match(/\b\w{3,}\b/g)?.slice(0, 5) ?? [];
    if (words.length >= 2) {
      const candidatePattern = words.slice(0, 3).join("_");
      const candidateRegex = words.slice(0, 3).join("\\s+\\w*\\s*");
      const existingRegex = getPatternRegex(candidatePattern);
      createDecisionEntry({
        pattern: candidatePattern,
        patternRegex: existingRegex ?? candidateRegex,
        strategy: "fast_path",
        skipConfidence: true,
        skipComplexity: true,
        preferredModel: ctx.selectedModel,
        initialConfidence: 0.6,
      }).catch((err) =>
        log.warn("createDecisionEntry from trivial task failed", { error: String(err) })
      );
    }
  }

  // Save phase metrics (non-critical)
  tracker.end();
  if (ctx.jobId) {
    try {
      await savePhaseMetrics(ctx.jobId, ctx.taskId, tracker.getAll());
    } catch (err) {
      log.warn("savePhaseMetrics failed", { error: err instanceof Error ? err.message : String(err) });
    }
    await completeJob(ctx.jobId).catch((err) => log.warn("completeJob failed", { error: err instanceof Error ? err.message : String(err) }));
  }

  // === D22: Record routing pattern for future 0-token routing ===
  // Fire-and-forget — non-critical observability
  if (ctx.userMessage) {
    recordRoutingPattern(ctx.userMessage, {
      success: true,
      model: ctx.selectedModel,
    }).catch((err) => log.warn("recordRoutingPattern failed", { error: String(err) }));
  }

  // === D24: Anomaly detection — fire-and-forget, non-critical ===
  checkTokenAnomaly(ctx.totalTokensUsed, ctx.thefoldTaskId ?? undefined).catch((err) =>
    log.warn("checkTokenAnomaly failed", { error: String(err) })
  );
  checkCostAnomaly(ctx.totalCostUsd, ctx.thefoldTaskId ?? undefined).catch((err) =>
    log.warn("checkCostAnomaly failed", { error: String(err) })
  );

  // === D26: Episodic memory — store narrative summary of completed task (fire-and-forget) ===
  if (ctx.thefoldTaskId) {
    const episodeTitle = `Task completed: ${ctx.taskDescription.split("\n")[0].substring(0, 100)}`;
    const episodeContent = [
      `Repository: ${ctx.repoOwner}/${ctx.repoName}`,
      `Files changed: ${allFiles.length}`,
      prUrl ? `PR: ${prUrl}` : "No PR created",
      `Attempts: ${ctx.totalAttempts}`,
      `Cost: $${ctx.totalCostUsd.toFixed(4)} · Tokens: ${ctx.totalTokensUsed.toLocaleString()}`,
      documentation ? `\nSummary:\n${documentation.substring(0, 500)}` : "",
    ].join("\n");

    memory.storeEpisode({
      title: episodeTitle,
      content: episodeContent,
      sourceRepo: `${ctx.repoOwner}/${ctx.repoName}`,
      relatedTaskIds: [ctx.thefoldTaskId],
      tags: ["task-completion", ctx.repoName],
    }).catch((err: unknown) => log.warn("storeEpisode failed", { error: String(err) }));
  }

  return {
    success: true,
    prUrl: prUrl || undefined,
    filesChanged: allFiles.map((f) => f.path),
    costUsd: ctx.totalCostUsd,
    tokensUsed: ctx.totalTokensUsed,
  };
}

// --- Knowledge Distillation (D14) ---

/**
 * D14: Distill learned rules from a completed task.
 * Only runs when qualityScore >= 7 AND (retries > 0 OR fast-path pattern matched).
 * Calls AI (haiku) to extract 0-3 rules, stores each via memory.storeKnowledge().
 */
export async function maybeDistill(
  ctx: AgentExecutionContext,
  qualityScore: number
): Promise<void> {
  if (qualityScore < 7) return;
  if (ctx.totalAttempts <= 1 && !ctx.fastPathPattern) return;

  try {
    // Build compact history for AI
    const errorSummary = ctx.attemptHistory
      .filter((a) => a.result === "failure" && a.error)
      .map((a, i) => `Attempt ${i + 1} failed: ${a.error?.substring(0, 200)}`)
      .join("\n");

    const prompt = [
      "Extract 0-3 short, actionable rules learned from this completed task.",
      "Rules should be concise (under 100 chars), generalizable, and useful for future similar tasks.",
      "Return JSON array of objects: [{rule, category, context}]",
      "Categories: coding, testing, debugging, architecture, tooling, security",
      "If nothing useful was learned, return []",
      "",
      `Task: ${ctx.taskDescription.substring(0, 300)}`,
      errorSummary ? `\nErrors encountered:\n${errorSummary}` : "",
      `Attempts: ${ctx.totalAttempts}`,
    ].join("\n");

    const response = await ai.chat({
      messages: [{ role: "user", content: prompt }],
      memoryContext: [],
      systemContext: "agent_review",
      model: "claude-haiku-4-5",
    });

    // Parse JSON from AI response
    const text = response.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return;

    let rules: Array<{ rule: string; category: string; context?: string }>;
    try {
      rules = JSON.parse(match[0]);
    } catch {
      return;
    }

    if (!Array.isArray(rules) || rules.length === 0) return;

    // Store each rule (max 3)
    for (const entry of rules.slice(0, 3)) {
      if (!entry.rule || typeof entry.rule !== "string") continue;
      try {
        await memory.storeKnowledge({
          rule: entry.rule.substring(0, 200),
          category: entry.category ?? "general",
          context: entry.context?.substring(0, 500),
          sourceTaskId: ctx.thefoldTaskId,
          sourceModel: ctx.selectedModel,
          confidence: 0.5,
        });
      } catch (err) {
        log.warn("storeKnowledge failed", { error: String(err) });
      }
    }

    log.info("maybeDistill completed", { rules: rules.length, taskId: ctx.taskId });
  } catch (err) {
    log.warn("maybeDistill error", { error: String(err) });
  }
}

// --- Helper: Procedural memory (YE) ---

/**
 * YE: Detect task pattern from description and files.
 * Returns category for strategy classification.
 */
export function detectTaskPattern(
  taskDescription: string,
  files: Array<{ path: string; content: string; action: string }>,
): string {
  const desc = taskDescription.toLowerCase();
  const paths = files.map((f) => f.path.toLowerCase()).join(" ");

  // Heuristikk-basert kategorisering
  if (desc.includes("migrat") || paths.includes("migration") || paths.includes(".up.sql")) {
    return "database_migration";
  }
  if (desc.includes("api") && (desc.includes("endpoint") || desc.includes("route"))) {
    return "api_endpoint";
  }
  if (
    desc.includes("component") || desc.includes("ui") || desc.includes("frontend")
    || paths.includes("/components/") || paths.includes(".tsx")
  ) {
    return "frontend_component";
  }
  if (desc.includes("bug") || desc.includes("fix") || desc.includes("error")) {
    return "bug_fix";
  }
  if (desc.includes("refactor") || desc.includes("clean") || desc.includes("improve")) {
    return "refactoring";
  }
  if (desc.includes("test") || paths.includes(".test.") || paths.includes(".spec.")) {
    return "testing";
  }
  if (desc.includes("security") || desc.includes("auth") || desc.includes("permission")) {
    return "security";
  }
  if (desc.includes("performance") || desc.includes("optimize") || desc.includes("speed")) {
    return "performance";
  }
  if (desc.includes("integrat") || desc.includes("connect") || desc.includes("webhook")) {
    return "integration";
  }
  return "other";
}

/**
 * YE: Extract successful steps from attempt history.
 * Only includes steps that worked (based on first successful attempt).
 */
export function extractSuccessfulSteps(
  attemptHistory: Array<{
    attemptNumber: number;
    result: "success" | "failure";
    error?: string;
    plan?: { steps: Array<{ title: string; description: string }> };
  }>,
): string[] {
  // Find first successful attempt
  const successfulAttempt = attemptHistory.find((a) => a.result === "success");
  if (!successfulAttempt || !successfulAttempt.plan) {
    return [];
  }

  // Extract step titles from successful plan
  return successfulAttempt.plan.steps.map((s) => s.title);
}

// --- Helper: Extract and register components ---

/**
 * Extract and register components (fire-and-forget helper for STEP 9.5).
 * Calls ai.callForExtraction and registry.register for each component.
 */
async function extractAndRegisterComponents(params: {
  repo: string;
  files: Array<{ path: string; content: string }>;
  taskDescription: string;
}): Promise<number> {
  // Filtrer bort test-filer og config-filer
  const candidateFiles = params.files.filter((f) =>
    !f.path.includes(".test.") &&
    !f.path.includes(".spec.") &&
    !f.path.includes("node_modules") &&
    !f.path.endsWith(".json") &&
    !f.path.endsWith(".md") &&
    !f.path.endsWith(".lock") &&
    f.content.length > 100
  );

  if (candidateFiles.length < 2) {
    log.info("too few candidate files for extraction", { count: candidateFiles.length });
    return 0;
  }

  // Kall AI for extraction
  const filesSummary = candidateFiles.map((f) => ({
    path: f.path,
    content: f.content.substring(0, 2000), // Begrens til 2000 tegn per fil
    lines: f.content.split("\n").length,
  }));

  const response = await ai.callForExtraction({
    task: params.taskDescription,
    repo: params.repo,
    files: filesSummary,
  });

  // Registrer hver komponent
  let registered = 0;
  for (const comp of response.components) {
    if (!comp.name || !comp.files || comp.files.length === 0 || comp.qualityScore < 50) {
      continue; // Skip invalid components
    }

    try {
      // Berik med full filinnhold
      const enrichedFiles = (comp.files as Array<{ path: string; content: string }>).map((cf) => {
        const original = params.files.find((f) => f.path === cf.path);
        return {
          path: cf.path,
          content: original?.content || cf.content,
          language: detectLanguage(cf.path),
        };
      });

      await registry.register({
        name: comp.name,
        description: comp.description,
        category: comp.category as any,
        files: enrichedFiles,
        entryPoint: comp.entryPoint,
        dependencies: comp.dependencies || [],
        sourceRepo: params.repo,
        tags: comp.tags || [],
        version: "1.0.0",
      });

      registered++;
      log.info("auto-registered component", { name: comp.name, repo: params.repo });
    } catch (regErr) {
      // Duplikat-navn etc. — logg og fortsett
      log.warn("auto-register failed", { name: comp.name, error: String(regErr) });
    }
  }

  log.info("extraction completed", { repo: params.repo, registered, total: response.components.length });
  return registered;
}

function detectLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".html")) return "html";
  return "unknown";
}
