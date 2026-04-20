import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { sanitize } from "./sanitize";
import {
  BASE_RULES,
  buildSystemPromptWithPipeline, logSkillResults,
} from "./prompts";
import { callAIWithFallback, stripMarkdownJson, DEFAULT_MODEL } from "./call";
import { selectOptimalModel } from "./router";
import { selectForRole } from "./roles";

import type {
  ChatMessage, AgentThinkRequest, AgentThinkResponse, TaskStep,
} from "./types";

// --- Complexity Assessment ---

export interface AssessComplexityRequest {
  taskDescription: string;
  projectStructure: string;
  fileCount: number;
  model?: string;
}

export interface AssessComplexityResponse {
  complexity: number; // 1-10
  reasoning: string;
  suggestedModel: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const assessComplexity = api(
  { method: "POST", path: "/ai/assess-complexity", expose: false },
  async (req: AssessComplexityRequest): Promise<AssessComplexityResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const prompt = `Assess the complexity of this task on a scale of 1-10.

## Task
${req.taskDescription}

## Project (${req.fileCount} files)
${req.projectStructure.substring(0, 2000)}

Respond with JSON only:
{
  "complexity": 5,
  "reasoning": "why this complexity level",
  "suggestedModel": "claude-sonnet-4-5-20250929"
}

Guidelines:
- 1-3: Simple (rename, add field, small fix) → use haiku/budget model
- 4-6: Standard (new endpoint, refactor, bug fix) → use sonnet/standard model
- 7-10: Complex (new service, architecture change, multi-file) → use opus/premium model`;

    const response = await callAIWithFallback({
      model,
      system: BASE_RULES,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1024,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));
      return {
        complexity: parsed.complexity || 5,
        reasoning: parsed.reasoning || "",
        suggestedModel: parsed.suggestedModel || DEFAULT_MODEL,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      return {
        complexity: 5,
        reasoning: "Could not parse complexity assessment",
        suggestedModel: DEFAULT_MODEL,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

// --- Confidence Assessment ---

export interface TaskConfidence {
  overall: number;
  breakdown: {
    task_understanding: number;
    codebase_familiarity: number;
    technical_complexity: number;
    test_coverage_feasible: number;
  };
  uncertainties: string[];
  recommended_action: "proceed" | "clarify" | "break_down";
  clarifying_questions?: string[];
  suggested_subtasks?: string[];
}

export interface AssessConfidenceRequest {
  taskDescription: string;
  projectStructure: string;
  relevantFiles: Array<{ path: string; content: string }>;
  memoryContext: string[];
  docsContext: string[];
  model?: string;
}

export interface AssessConfidenceResponse {
  confidence: TaskConfidence;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const assessConfidence = api(
  { method: "POST", path: "/ai/assess-confidence", expose: false },
  async (req: AssessConfidenceRequest): Promise<AssessConfidenceResponse> => {
    const model = req.model || DEFAULT_MODEL;

    let prompt = `## Task to Assess\n${req.taskDescription}\n\n`;
    prompt += `## Project Structure\n\`\`\`\n${req.projectStructure}\n\`\`\`\n\n`;

    if (req.relevantFiles.length > 0) {
      prompt += `## Relevant Files\n`;
      req.relevantFiles.forEach((f) => {
        prompt += `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\`\n\n`;
      });
    }

    if (req.docsContext.length > 0) {
      prompt += `## Available Documentation\n`;
      req.docsContext.forEach((d, i) => {
        prompt += `${i + 1}. ${d}\n`;
      });
      prompt += "\n";
    }

    if (req.memoryContext.length > 0) {
      prompt += `## Past Context\n`;
      req.memoryContext.forEach((m, i) => {
        prompt += `${i + 1}. ${m}\n`;
      });
      prompt += "\n";
    }

    prompt += `Assess your confidence in completing this task. Respond with JSON only.`;

    const messages: ChatMessage[] = [{ role: "user", content: prompt }];

    const pipeline = await buildSystemPromptWithPipeline("confidence_assessment", {
      task: req.taskDescription,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages,
      maxTokens: 4096,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const confidence = JSON.parse(jsonText) as TaskConfidence;

      if (!confidence.overall && confidence.breakdown) {
        const b = confidence.breakdown;
        confidence.overall = Math.round(
          (b.task_understanding +
            b.codebase_familiarity +
            b.technical_complexity +
            b.test_coverage_feasible) / 4
        );
      }

      if (!confidence.recommended_action) {
        if (confidence.overall >= 75) {
          confidence.recommended_action = "proceed";
        } else if (confidence.overall >= 60) {
          confidence.recommended_action = "clarify";
        } else {
          confidence.recommended_action = "break_down";
        }
      }

      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        confidence,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      throw APIError.internal("failed to parse confidence assessment as JSON");
    }
  }
);

// --- Agent Planning ---

export const planTask = api(
  { method: "POST", path: "/ai/plan", expose: false },
  async (req: AgentThinkRequest): Promise<AgentThinkResponse> => {
    // Use user-specified model, or select via planner role
    let model: string;
    if (req.model) {
      model = req.model;
    } else {
      try {
        model = await selectForRole("planner");
      } catch {
        // Fallback to default if role-based fails
        model = DEFAULT_MODEL;
      }
    }

    req.task = sanitize(req.task, { maxLength: 100_000 });

    let prompt = `## Task\n${req.task}\n\n`;
    prompt += `## Project Structure\n\`\`\`\n${req.projectStructure}\n\`\`\`\n\n`;

    if (req.relevantFiles.length > 0) {
      prompt += `## Relevant Files\n`;
      req.relevantFiles.forEach((f) => {
        prompt += `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\`\n\n`;
      });
    }

    if (req.docsContext.length > 0) {
      prompt += `## Library Documentation\n`;
      req.docsContext.forEach((d, i) => {
        prompt += `${i + 1}. ${d}\n`;
      });
      prompt += "\n";
    }

    if (req.previousAttempt && req.errorMessage) {
      prompt += `## Previous Attempt Failed\nError: ${req.errorMessage}\nFix the issue and try a different approach.\n\n`;
    }

    prompt += `Create a step-by-step plan. Respond with JSON only.`;

    const messages: ChatMessage[] = [{ role: "user", content: prompt }];

    if (req.memoryContext.length > 0) {
      messages.push({
        role: "user",
        content: `Relevant memories:\n${req.memoryContext.join("\n")}`,
      });
    }

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: req.task,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages,
      maxTokens: 32768,
    });

    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    try {
      let jsonText = stripMarkdownJson(response.content);

      if (response.stopReason === "max_tokens" || response.content.length > 15000) {
        const openBraces = (jsonText.match(/{/g) || []).length;
        const closeBraces = (jsonText.match(/}/g) || []).length;
        const openBrackets = (jsonText.match(/\[/g) || []).length;
        const closeBrackets = (jsonText.match(/]/g) || []).length;

        if (openBraces > closeBraces || openBrackets > closeBrackets) {
          jsonText = jsonText.replace(/,\s*"[^"]*":\s*"[^"]*$/, "");
          jsonText = jsonText.replace(/,\s*"[^"]*":\s*$/, "");
          jsonText = jsonText.replace(/,\s*{[^}]*$/, "");
          for (let i = 0; i < openBrackets - closeBrackets; i++) jsonText += "]";
          for (let i = 0; i < openBraces - closeBraces; i++) jsonText += "}";
        }
      }

      const parsed = JSON.parse(jsonText);

      const rawPlan = Array.isArray(parsed.plan) ? parsed.plan : [];
      const validatedPlan: TaskStep[] = rawPlan.map((step: Record<string, unknown>) => ({
        action: String(step.action || "create_file") as TaskStep["action"],
        filePath: String(step.filePath || step.file_path || ""),
        content: String(step.content || ""),
        command: step.command != null ? String(step.command) : undefined,
        description: String(step.description || step.reasoning || ""),
      }));

      return {
        plan: validatedPlan,
        reasoning: String(parsed.reasoning || ""),
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch (e) {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      throw APIError.internal("failed to parse planning response as JSON: " + (e instanceof Error ? e.message : String(e)));
    }
  }
);

// --- Project Decomposition (Hierarchical 3-stage pipeline) ---

interface DecomposePhase {
  name: string;
  description: string;
}

interface DecomposeTask {
  title: string;
  description: string;
  complexity: "low" | "medium" | "high";
  dependencies: string[];
  contextHints: string[];
  inputContracts?: string[];
  outputContracts?: string[];
}

interface DecomposeProjectRequest {
  userMessage: string;
  repoOwner: string;
  repoName: string;
  projectStructure: string;
  existingFiles?: Array<{ path: string; content: string }>;
  /** Optional: preferred model ID — if set, use this instead of auto-selection */
  model?: string;
}

interface DecomposeProjectResponse {
  phases: Array<{
    name: string;
    description: string;
    tasks: Array<{
      title: string;
      description: string;
      dependsOnIndices: number[];
      contextHints: string[];
      inputContracts?: string[];
      outputContracts?: string[];
    }>;
  }>;
  conventions: string;
  reasoning: string;
  estimatedTotalTasks: number;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

// --- Stage 1: Decompose into phases ---
async function decomposeToPhases(
  projectDescription: string,
  repoOwner: string,
  repoName: string,
  context?: string
): Promise<DecomposePhase[]> {
  const model = await selectForRole("orchestrator").catch(() => selectOptimalModel(7, "auto", undefined, "planning"));

  const systemPrompt = `You are a software architect. Break the given project into 3–7 sequential implementation phases.
Each phase should be independently completable and build on previous phases.
Respond with ONLY valid JSON, no markdown, no explanation.`;

  const userPrompt = `Project: ${projectDescription.slice(0, 2000)}
Repository: ${repoOwner}/${repoName}
${context ? `\n\nAdditional context: ${context.slice(0, 500)}` : ""}

Respond with JSON in this exact format:
{
  "phases": [
    { "name": "Phase Name", "description": "What this phase accomplishes in 1-2 sentences" }
  ],
  "conventions": "Key development conventions and patterns to follow throughout"
}`;

  const response = await callAIWithFallback({
    model,
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
    maxTokens: 1500,
  });

  try {
    const parsed = JSON.parse(stripMarkdownJson(response.content));
    return (parsed.phases || []).map((p: any) => ({
      name: p.name,
      description: p.description,
    }));
  } catch (err) {
    log.warn("Stage 1: Failed to parse phases response", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// --- Stage 2: Decompose each phase into tasks ---
async function decomposePhaseToTasks(
  phase: DecomposePhase,
  projectDescription: string,
  previousPhaseNames: string[]
): Promise<DecomposeTask[]> {
  const model = await selectForRole("planner").catch(() => selectOptimalModel(5, "auto", undefined, "planning"));

  const systemPrompt = `You are a senior developer breaking down a project phase into concrete implementation tasks.
Tasks should be atomic (one clear deliverable each), actionable, and estimable.
Respond with ONLY valid JSON.`;

  const previousContext = previousPhaseNames.length > 0
    ? `\nPrevious phases already completed: ${previousPhaseNames.join(", ")}`
    : "";

  const attemptDecompose = async (isRetry: boolean): Promise<DecomposeTask[]> => {
    const retryNote = isRetry
      ? "\n\nIMPORTANT: Your previous response had invalid JSON. Return ONLY a valid JSON object. No markdown. No explanation. Start with { and end with }."
      : "";

    const userPrompt = `Project: ${projectDescription.slice(0, 1000)}${previousContext}

Phase to break down:
Name: ${phase.name}
Description: ${phase.description}

Break this phase into 3–8 concrete tasks. For each task, include dependencies on OTHER task titles (not task indices).
Respond with JSON:
{
  "tasks": [
    {
      "title": "Short task title",
      "description": "What exactly needs to be done (2-3 sentences)",
      "complexity": "low|medium|high",
      "dependencies": ["title of another task in THIS phase"],
      "contextHints": ["hint about what context might be needed"],
      "inputContracts": ["what this task depends on from previous tasks"],
      "outputContracts": ["what this task produces that others need"]
    }
  ]
}${retryNote}`;

    const response = await callAIWithFallback({
      model,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
      maxTokens: 2500,
    });

    const parsed = JSON.parse(stripMarkdownJson(response.content));
    return (parsed.tasks || []).map((t: any) => ({
      title: t.title,
      description: t.description,
      complexity: t.complexity || "medium",
      dependencies: t.dependencies || [],
      contextHints: t.contextHints || [],
      inputContracts: t.inputContracts || [],
      outputContracts: t.outputContracts || [],
    }));
  };

  try {
    return await attemptDecompose(false);
  } catch (firstErr) {
    // Only retry with the JSON-fix note for actual JSON parse errors (SyntaxError).
    // Provider errors (rate limit, auth, credits) are already handled with retries/fallback
    // inside callAIWithFallback — re-throwing them here would cause double-retry chaos.
    if (!(firstErr instanceof SyntaxError)) {
      log.error("Stage 2: Provider error decomposing phase, returning empty tasks", {
        phase: phase.name,
        error: firstErr instanceof Error ? firstErr.message : String(firstErr),
      });
      return [];
    }

    log.warn("Stage 2: JSON parse error in phase response, retrying with strict JSON note", {
      phase: phase.name,
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });

    try {
      return await attemptDecompose(true);
    } catch (secondErr) {
      log.error("Stage 2: Failed to parse tasks for phase after retry, returning empty tasks", {
        phase: phase.name,
        error: secondErr instanceof Error ? secondErr.message : String(secondErr),
      });
      return [];
    }
  }
}

// --- Stage 3: Assemble and convert to response format ---
export const decomposeProject = api(
  { method: "POST", path: "/ai/decompose-project", expose: false },
  async (req: DecomposeProjectRequest): Promise<DecomposeProjectResponse> => {
    req.userMessage = sanitize(req.userMessage, { maxLength: 100_000 });

    const pipeline = await buildSystemPromptWithPipeline("project_decomposition", {
      task: req.userMessage,
      repo: `${req.repoOwner}/${req.repoName}`,
    });

    let totalTokensUsed = 0;
    let modelUsed = "claude-sonnet-4-5-20250929";
    let totalCostUsd = 0;

    log.info("Stage 1: Decomposing project into phases", {
      descriptionLength: req.userMessage.length,
    });

    // Stage 1: Get phases
    const phases = await decomposeToPhases(req.userMessage, req.repoOwner, req.repoName, req.projectStructure);
    log.info("Phases generated", { count: phases.length, phases: phases.map(p => p.name) });

    if (phases.length === 0) {
      throw APIError.internal("Phase decomposition returned no phases");
    }

    // Stage 2: Decompose each phase in parallel
    log.info("Stage 2: Decomposing phases into tasks (parallel)", { phaseCount: phases.length });
    const phaseTaskResults = await Promise.allSettled(
      phases.map((phase, i) =>
        decomposePhaseToTasks(
          phase,
          req.userMessage,
          phases.slice(0, i).map(p => p.name)
        )
      )
    );

    // Stage 3: Assemble results
    const responsePhases: DecomposeProjectResponse["phases"] = [];
    let globalTaskIndex = 0;
    const taskTitleToIndex = new Map<string, number>();

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const result = phaseTaskResults[i];

      let phaseTasks: DecomposeTask[] = [];
      if (result.status === "fulfilled") {
        phaseTasks = result.value;
      } else {
        log.warn("Phase decomposition failed, using empty task list", {
          phase: phase.name,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }

      // Convert DecomposeTask to response format with dependency index resolution
      const convertedTasks: DecomposeProjectResponse["phases"][0]["tasks"] = [];

      for (const task of phaseTasks) {
        // Build title→index map for intra-phase dependencies
        const taskIndex = globalTaskIndex++;
        taskTitleToIndex.set(task.title, taskIndex);
      }

      // Second pass: resolve dependencies now that all tasks are indexed
      globalTaskIndex = responsePhases.reduce((sum, p) => sum + p.tasks.length, 0);
      for (const task of phaseTasks) {
        const taskIndex = globalTaskIndex++;
        const dependsOnIndices = task.dependencies
          .map(depTitle => taskTitleToIndex.get(depTitle))
          .filter((idx): idx is number => idx !== undefined)
          .filter(idx => idx < taskIndex); // Only allow backward deps

        convertedTasks.push({
          title: task.title,
          description: task.description,
          dependsOnIndices,
          contextHints: task.contextHints,
          inputContracts: task.inputContracts,
          outputContracts: task.outputContracts,
        });
      }

      responsePhases.push({
        name: phase.name,
        description: phase.description,
        tasks: convertedTasks,
      });
    }

    // Calculate totals
    let estimatedTotalTasks = 0;
    for (const phase of responsePhases) {
      estimatedTotalTasks += phase.tasks.length;
    }

    log.info("Stage 3: Assembly complete", { totalTasks: estimatedTotalTasks });

    await logSkillResults(pipeline.skillIds, true, totalTokensUsed);

    return {
      phases: responsePhases,
      conventions: "Ensure all code follows TypeScript best practices with proper type safety and error handling.",
      reasoning: `Decomposed into ${responsePhases.length} phases with ${estimatedTotalTasks} total tasks using 3-stage hierarchical pipeline.`,
      estimatedTotalTasks,
      tokensUsed: totalTokensUsed,
      modelUsed,
      costUsd: totalCostUsd,
    };
  }
);

// --- Phase Revision (between-phase re-planning) ---

interface ReviseProjectPhaseRequest {
  projectConventions: string;
  completedPhase: {
    name: string;
    tasks: Array<{
      title: string;
      status: string;
      outputFiles: string[];
      outputTypes: string[];
      errorMessage?: string;
    }>;
  };
  nextPhase: {
    name: string;
    tasks: Array<{
      title: string;
      description: string;
      contextHints: string[];
    }>;
  };
  projectStructure: string;
}

interface ReviseProjectPhaseResponse {
  revisedTasks: Array<{
    originalTitle: string;
    revisedDescription?: string;
    shouldSkip?: boolean;
    newContextHints?: string[];
    reason: string;
  }>;
  newTasksToAdd: Array<{
    title: string;
    description: string;
    contextHints: string[];
    insertAfterTitle?: string;
  }>;
  reasoning: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const reviseProjectPhase = api(
  { method: "POST", path: "/ai/revise-project-phase", expose: false },
  async (req: ReviseProjectPhaseRequest): Promise<ReviseProjectPhaseResponse> => {
    const model = "claude-haiku-4-5-20251001";

    const completedSummary = req.completedPhase.tasks.map((t) => {
      const status = t.status === "completed" ? "✅" : t.status === "failed" ? "❌" : "⏭️";
      const files = t.outputFiles.length > 0 ? ` (files: ${t.outputFiles.join(", ")})` : "";
      const err = t.errorMessage ? ` Error: ${t.errorMessage}` : "";
      return `${status} ${t.title}${files}${err}`;
    }).join("\n");

    const nextTasksSummary = req.nextPhase.tasks.map((t) =>
      `- ${t.title}: ${t.description.substring(0, 200)}${t.description.length > 200 ? "..." : ""}\n  Context hints: ${t.contextHints.join(", ") || "none"}`
    ).join("\n");

    const prompt = `## Completed Phase: ${req.completedPhase.name}
${completedSummary}

## Next Phase: ${req.nextPhase.name}
${nextTasksSummary}

## Project Conventions (summary)
${req.projectConventions.substring(0, 1000)}

## Current Project Structure
${req.projectStructure.substring(0, 2000)}

Based on what was ACTUALLY built (or failed) in the completed phase, revise the next phase's tasks.

Respond with JSON only:
{
  "revisedTasks": [
    {
      "originalTitle": "exact title from next phase",
      "revisedDescription": "updated description if needed, or omit",
      "shouldSkip": false,
      "newContextHints": ["updated hints if needed"],
      "reason": "why this change"
    }
  ],
  "newTasksToAdd": [
    {
      "title": "new task if needed",
      "description": "what to build",
      "contextHints": ["relevant context"],
      "insertAfterTitle": "title of task to insert after"
    }
  ],
  "reasoning": "overall explanation of adjustments"
}

Rules:
- Only revise tasks that NEED changes based on completed phase results
- If a dependency failed, consider skipping dependent tasks or adjusting them
- Update contextHints to reference actual output files from completed tasks
- Keep changes minimal — don't rewrite tasks that are already correct
- If everything went well, return empty revisedTasks and newTasksToAdd arrays`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: "phase revision",
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));

      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        revisedTasks: parsed.revisedTasks || [],
        newTasksToAdd: parsed.newTasksToAdd || [],
        reasoning: parsed.reasoning || "",
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      return {
        revisedTasks: [],
        newTasksToAdd: [],
        reasoning: "Could not parse revision response — keeping original plan",
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

// --- Task Order Planning ---

interface PlanTaskOrderRequest {
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    labels: string[];
    dependsOn: string[];
  }>;
  repo: string;
  historicalContext?: string[];
}

interface PlanTaskOrderResponse {
  orderedTasks: Array<{
    id: string;
    plannedOrder: number;
    estimatedComplexity: number;
    reasoning: string;
  }>;
}

export const planTaskOrder = api(
  { method: "POST", path: "/ai/plan-task-order", expose: false },
  async (req: PlanTaskOrderRequest): Promise<PlanTaskOrderResponse> => {
    if (!req.tasks || req.tasks.length === 0) {
      return { orderedTasks: [] };
    }

    const model = "claude-haiku-4-5-20251001";

    const taskList = req.tasks.map((t, i) => `${i + 1}. [${t.id}] ${t.title}${t.description ? ` — ${t.description}` : ""}${t.labels.length > 0 ? ` (labels: ${t.labels.join(", ")})` : ""}${t.dependsOn.length > 0 ? ` (depends on: ${t.dependsOn.join(", ")})` : ""}`).join("\n");

    const historySection = req.historicalContext && req.historicalContext.length > 0
      ? `\n\n## Historical context from past tasks:\n${req.historicalContext.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nUse this history to: estimate complexity more accurately, deprioritize tasks similar to past failures, prioritize tasks where we have proven strategies.`
      : "";

    const prompt = `## Tasks for repo: ${req.repo}\n\n${taskList}${historySection}\n\nAnalyze these tasks and return an optimal execution order as JSON.`;

    const systemPrompt = `You are a project planner. Analyze the given tasks and suggest an optimal execution order.

Prioritize:
1. Dependencies (depends_on must be resolved first)
2. Foundation first (types → lib → features → tests)
3. Simple tasks first for momentum
4. Security fixes > bugs > upgrades

Respond with JSON only:
{
  "orderedTasks": [
    { "id": "uuid", "plannedOrder": 1, "estimatedComplexity": 3, "reasoning": "short explanation" }
  ]
}

estimatedComplexity is 1-5 (1=trivial, 5=very complex).
plannedOrder starts at 1 and increments sequentially.`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: "task order planning",
      repo: req.repo,
    });

    const response = await callAIWithFallback({
      model,
      system: systemPrompt + "\n\n" + pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));

      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        orderedTasks: (parsed.orderedTasks || []).map((t: { id: string; plannedOrder: number; estimatedComplexity: number; reasoning: string }) => ({
          id: t.id,
          plannedOrder: t.plannedOrder,
          estimatedComplexity: t.estimatedComplexity || 3,
          reasoning: t.reasoning || "",
        })),
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      return {
        orderedTasks: req.tasks.map((t, i) => ({
          id: t.id,
          plannedOrder: i + 1,
          estimatedComplexity: 3,
          reasoning: "AI planning failed — using default order",
        })),
      };
    }
  }
);

// --- User-driven Plan Revision ---

interface RevisePlanUserRequest {
  existingPlanId: string;
  editRequest: string;
  currentPhases?: Array<{
    name: string;
    description: string;
    tasks: Array<{ title: string; description: string; dependsOnIndices: number[] }>;
  }>;
}

interface RevisePlanUserResponse {
  phases: Array<{
    name: string;
    description: string;
    tasks: Array<{
      title: string;
      description: string;
      dependsOnIndices: number[];
      contextHints: string[];
    }>;
  }>;
  conventions: string;
  totalTasks: number;
  reasoning: string;
  tokensUsed: number;
  modelUsed: string;
}

export const revisePlanUser = api(
  { method: "POST", path: "/ai/revise-plan-user", expose: false },
  async (req: RevisePlanUserRequest): Promise<RevisePlanUserResponse> => {
    const model = await selectForRole("planner").catch(() => DEFAULT_MODEL);

    const existingPhasesText = req.currentPhases
      ? req.currentPhases.map((p, pi) =>
          `Phase ${pi + 1}: ${p.name}\n${p.tasks.map((t, ti) => `  ${ti + 1}. ${t.title}: ${t.description.substring(0, 120)}`).join("\n")}`
        ).join("\n\n")
      : "(current plan not provided)";

    const prompt = `You are revising an existing project plan based on user feedback.

## Existing Plan
${existingPhasesText}

## User's Edit Request
${sanitize(req.editRequest)}

Apply the requested changes. You may add phases, remove phases, add tasks, remove tasks, or restructure as needed.

Respond with valid JSON only:
{
  "phases": [
    {
      "name": "Phase name",
      "description": "Brief description",
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed description",
          "dependsOnIndices": [],
          "contextHints": []
        }
      ]
    }
  ],
  "conventions": "Any architectural conventions or constraints",
  "reasoning": "Brief explanation of what changed and why"
}`;

    const response = await callAIWithFallback({
      model,
      system: BASE_RULES,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8000,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));
      const phases = parsed.phases || [];
      const totalTasks = phases.reduce((sum: number, p: { tasks: unknown[] }) => sum + (p.tasks?.length ?? 0), 0);
      return {
        phases,
        conventions: parsed.conventions || "",
        totalTasks,
        reasoning: parsed.reasoning || "",
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
      };
    } catch {
      return {
        phases: req.currentPhases?.map(p => ({
          ...p,
          tasks: p.tasks.map(t => ({ ...t, contextHints: [] })),
        })) || [],
        conventions: "",
        totalTasks: req.currentPhases?.reduce((s, p) => s + p.tasks.length, 0) || 0,
        reasoning: "AI revision failed — returning original plan",
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
      };
    }
  }
);
