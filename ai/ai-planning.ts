import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { sanitize } from "./sanitize";
import {
  BASE_RULES,
  buildSystemPromptWithPipeline, logSkillResults,
} from "./prompts";
import { callAIWithFallback, stripMarkdownJson, DEFAULT_MODEL } from "./call";

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
    const model = req.model || DEFAULT_MODEL;

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

// --- Project Decomposition ---

interface DecomposeProjectRequest {
  userMessage: string;
  repoOwner: string;
  repoName: string;
  projectStructure: string;
  existingFiles?: Array<{ path: string; content: string }>;
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

export const decomposeProject = api(
  { method: "POST", path: "/ai/decompose-project", expose: false },
  async (req: DecomposeProjectRequest): Promise<DecomposeProjectResponse> => {
    req.userMessage = sanitize(req.userMessage, { maxLength: 100_000 });

    const model = "claude-sonnet-4-5-20250929";

    let prompt = `## User Request\n${req.userMessage}\n\n`;
    prompt += `## Repository\n${req.repoOwner}/${req.repoName}\n\n`;
    prompt += `## Project Structure\n\`\`\`\n${req.projectStructure}\n\`\`\`\n\n`;

    if (req.existingFiles && req.existingFiles.length > 0) {
      prompt += `## Existing Files (for context)\n`;
      for (const f of req.existingFiles) {
        prompt += `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\`\n\n`;
      }
    }

    prompt += `Decompose this request into atomic tasks organized in phases. Respond with JSON only.\n\n`;
    prompt += `For each task, also provide:\n`;
    prompt += `- inputContracts: list of what this task depends on from previous tasks (e.g. "UserService.createUser() function exported", "auth middleware in gateway/auth.ts")\n`;
    prompt += `- outputContracts: list of what this task produces that other tasks need (e.g. "POST /users endpoint", "JWT token interface exported from types.ts")`;

    const pipeline = await buildSystemPromptWithPipeline("project_decomposition", {
      task: req.userMessage,
      repo: `${req.repoOwner}/${req.repoName}`,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 16384,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);

      if (!parsed.phases || !Array.isArray(parsed.phases)) {
        throw new Error("missing phases array");
      }

      let totalTaskCount = 0;
      for (const phase of parsed.phases) {
        totalTaskCount += phase.tasks?.length || 0;
      }

      let taskIndex = 0;
      for (const phase of parsed.phases) {
        for (const task of phase.tasks || []) {
          for (const depIdx of task.dependsOnIndices || []) {
            if (depIdx < 0 || depIdx >= totalTaskCount || depIdx === taskIndex) {
              log.warn("invalid dependsOnIndex detected, removing", { depIdx, taskIndex, totalTaskCount });
              task.dependsOnIndices = (task.dependsOnIndices || []).filter((i: number) => i !== depIdx);
            }
          }
          taskIndex++;
        }
      }

      const conventions = parsed.conventions || "";
      if (conventions.length > 8000) {
        log.warn("conventions too long, truncating", { length: conventions.length });
      }

      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        phases: parsed.phases,
        conventions: conventions.substring(0, 8000),
        reasoning: parsed.reasoning || "",
        estimatedTotalTasks: parsed.estimatedTotalTasks || totalTaskCount,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch (err) {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      if (err instanceof SyntaxError) {
        throw APIError.internal("failed to parse decomposition response as JSON");
      }
      throw APIError.internal(`decomposition validation failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
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
