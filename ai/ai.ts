import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { sanitize } from "./sanitize";
import {
  BASE_RULES,
  buildSystemPromptWithPipeline, logSkillResults,
} from "./prompts";
import { callAIWithFallback, stripMarkdownJson, DEFAULT_MODEL } from "./call";
import { callWithTools, CHAT_TOOLS } from "./tools";

// --- Types (re-exported from ./types) ---
export type {
  ChatRequest, ChatResponse, AgentThinkRequest, FileContent,
  AgentThinkResponse, TaskStep, CodeGenRequest, CodeGenResponse,
  GeneratedFile, ReviewRequest, ReviewResponse,
  AICallOptions, AICallResponse,
} from "./types";

import type {
  ChatMessage, ChatRequest, ChatResponse, AgentThinkRequest,
  AgentThinkResponse, TaskStep, CodeGenRequest, CodeGenResponse,
  GeneratedFile, ReviewRequest, ReviewResponse,
  AICallOptions, AICallResponse, FileContent,
} from "./types";

// --- Endpoints ---

// Direct chat
export const chat = api(
  { method: "POST", path: "/ai/chat", expose: false },
  async (req: ChatRequest): Promise<ChatResponse> => {
    const model = req.model || DEFAULT_MODEL;

    // OWASP A03: Sanitize user messages
    req.messages = req.messages.map((m) =>
      m.role === "user" ? { ...m, content: sanitize(m.content) } : m
    );

    // Extract task from last user message for skill routing
    const lastUserMsg = [...req.messages].reverse().find((m) => m.role === "user");
    const pipeline = await buildSystemPromptWithPipeline(req.systemContext, {
      task: lastUserMsg?.content || "",
    }, req.aiName);

    let system = pipeline.systemPrompt;

    // Inject repo context if chatting from a specific repo
    if (req.repoName) {
      system += `\n\nYou are working in the repository: ${req.repoName}. When the user refers to "the repo", "the project", or "the code", they mean this specific repository.`;
      system += `\nIMPORTANT: If the user mentions a DIFFERENT repo name than "${req.repoName}", do NOT create a task for that other repo. Instead tell them to switch to the correct repo in the navigation bar first.`;
    } else {
      system += `\n\nThe user is in Global mode (no specific repo selected).`;
      system += `\nIf the user asks to create a NEW repo (e.g. "Create repo X"), proceed and create a task with the new repo name.`;
      system += `\nIf the user refers to an EXISTING repo (e.g. "Update the X repo"), tell them to switch to that repo in the navigation bar first.`;
    }

    // Inject actual repo file content
    if (req.repoContext) {
      system += `\n\n--- REPOSITORY CONTEXT ---\nThis is ACTUAL content from the repository. Base your answer ONLY on this — NEVER fabricate files or code not present here.\n${req.repoContext}`;
    }

    if (req.memoryContext.length > 0) {
      system += "\n\n## Relevant Context from Memory\n";
      req.memoryContext.forEach((m, i) => {
        system += `${i + 1}. ${m}\n`;
      });
    }

    // ALWAYS use tool-use — AI decides whether to invoke tools (create_task, start_task, etc.)
    console.log("[DEBUG-AG] ai.chat: using callWithTools, repoName:", req.repoName || "(none)");
    const toolResponse = await callWithTools({
      model,
      system,
      messages: req.messages,
      maxTokens: 8192,
      tools: CHAT_TOOLS,
      repoName: req.repoName,
      repoOwner: req.repoOwner,
      conversationId: req.conversationId,
      assessComplexityFn: async (r) => {
        const result = await assessComplexity(r);
        return { complexity: result.complexity, tokensUsed: result.tokensUsed };
      },
    });

    await logSkillResults(pipeline.skillIds, true, toolResponse.tokensUsed);

    return {
      content: toolResponse.content,
      tokensUsed: toolResponse.tokensUsed,
      stopReason: toolResponse.stopReason,
      modelUsed: toolResponse.modelUsed,
      costUsd: toolResponse.costEstimate.totalCost,
      toolsUsed: toolResponse.toolsUsed.length > 0 ? toolResponse.toolsUsed : undefined,
      lastCreatedTaskId: toolResponse.lastCreatedTaskId,
      usage: {
        inputTokens: toolResponse.inputTokens,
        outputTokens: toolResponse.outputTokens,
        totalTokens: toolResponse.inputTokens + toolResponse.outputTokens,
      },
      truncated: toolResponse.stopReason === "max_tokens",
    };
  }
);

// Agent planning — breaks task into steps
export const planTask = api(
  { method: "POST", path: "/ai/plan", expose: false },
  async (req: AgentThinkRequest): Promise<AgentThinkResponse> => {
    const model = req.model || DEFAULT_MODEL;

    // OWASP A03: Sanitize task description (may come from Linear)
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

    // Log skill usage
    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    try {
      let jsonText = stripMarkdownJson(response.content);

      // JSON repair for truncated responses (max_tokens hit)
      if (response.stopReason === "max_tokens" || response.content.length > 15000) {
        // Try to fix common truncation issues
        const openBraces = (jsonText.match(/{/g) || []).length;
        const closeBraces = (jsonText.match(/}/g) || []).length;
        const openBrackets = (jsonText.match(/\[/g) || []).length;
        const closeBrackets = (jsonText.match(/]/g) || []).length;

        if (openBraces > closeBraces || openBrackets > closeBrackets) {
          // Remove trailing incomplete property (e.g. "content": "half...)
          jsonText = jsonText.replace(/,\s*"[^"]*":\s*"[^"]*$/, "");
          jsonText = jsonText.replace(/,\s*"[^"]*":\s*$/, "");
          jsonText = jsonText.replace(/,\s*{[^}]*$/, "");
          // Close remaining brackets/braces
          for (let i = 0; i < openBrackets - closeBrackets; i++) jsonText += "]";
          for (let i = 0; i < openBraces - closeBraces; i++) jsonText += "}";
        }
      }

      const parsed = JSON.parse(jsonText);

      // Validate and normalize plan steps
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

// Code review and documentation
export const reviewCode = api(
  { method: "POST", path: "/ai/review", expose: false },
  async (req: ReviewRequest): Promise<ReviewResponse> => {
    const model = req.model || DEFAULT_MODEL;

    let prompt = `## Task\n${req.taskDescription}\n\n`;
    prompt += `## Files Changed\n`;
    req.filesChanged.forEach((f) => {
      prompt += `### ${f.path} (${f.action})\n\`\`\`\n${f.content}\n\`\`\`\n\n`;
    });
    prompt += `## Validation Output\n\`\`\`\n${req.validationOutput}\n\`\`\`\n\n`;
    prompt += `Review this work. Respond with JSON only.`;

    const pipeline = await buildSystemPromptWithPipeline("agent_review", {
      task: req.taskDescription,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8192,
    });

    // Log skill usage
    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    try {
      // Try multiple JSON extraction strategies
      let jsonText = stripMarkdownJson(response.content);
      let parsed: Record<string, unknown>;

      try {
        parsed = JSON.parse(jsonText);
      } catch {
        // Strategy 2: Strip prefix text before first `{`
        const firstBrace = response.content.indexOf("{");
        const lastBrace = response.content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonText = response.content.substring(firstBrace, lastBrace + 1);
          parsed = JSON.parse(jsonText);
        } else {
          // Strategy 3: Regex extract JSON object
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON object found in response");
          }
        }
      }

      return {
        documentation: parsed.documentation as string,
        memoriesExtracted: (parsed.memoriesExtracted as string[]) || [],
        qualityScore: (parsed.qualityScore as number) ?? 0,
        concerns: (parsed.concerns as string[]) || [],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch (parseErr) {
      log.warn("reviewCode: all JSON parsing strategies failed", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        responseLength: response.content.length,
        responsePreview: response.content.substring(0, 1000),
      });
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      // Honest fallback: qualityScore 0 + needsHumanReview flag
      return {
        documentation: response.content.substring(0, 2000),
        memoriesExtracted: [],
        qualityScore: 0,
        concerns: ["AI review response could not be parsed — needs human review"],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

// --- Project Review (whole-project, used by orchestrator) ---

interface ProjectReviewRequest {
  projectDescription: string;
  phases: Array<{
    name: string;
    tasks: Array<{
      title: string;
      status: string;
      filesChanged: string[];
    }>;
  }>;
  allFiles: Array<{ path: string; content: string; action: string }>;
  totalCostUsd: number;
  totalTokensUsed: number;
  model?: string;
}

interface ProjectReviewResponse {
  documentation: string;
  qualityScore: number;
  concerns: string[];
  architecturalDecisions: string[];
  memoriesExtracted: string[];
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const reviewProject = api(
  { method: "POST", path: "/ai/review-project", expose: false },
  async (req: ProjectReviewRequest): Promise<ProjectReviewResponse> => {
    const model = req.model || "claude-sonnet-4-5-20250929";

    // Build file summary with token-trimming
    const MAX_FILE_TOKENS = 60000;
    let fileTokens = 0;
    let fileSection = "## All Files\n\n";
    const fullFiles: string[] = [];
    const summaryFiles: string[] = [];

    // Sort: shorter files first (more likely to fit in full)
    const sortedFiles = [...req.allFiles].sort((a, b) => a.content.length - b.content.length);

    for (const f of sortedFiles) {
      const fileTokenEst = Math.ceil(f.content.length / 4);
      if (fileTokens + fileTokenEst < MAX_FILE_TOKENS) {
        fullFiles.push(`### ${f.path} (${f.action})\n\`\`\`\n${f.content}\n\`\`\`\n`);
        fileTokens += fileTokenEst;
      } else {
        const lines = f.content.split("\n").length;
        summaryFiles.push(`- ${f.path} (${f.action}, ${lines} lines)`);
      }
    }

    fileSection += fullFiles.join("\n");
    if (summaryFiles.length > 0) {
      fileSection += `\n### Files shown as summary (token limit)\n${summaryFiles.join("\n")}\n`;
    }

    // Build phase summary
    let phaseSection = "## Phases and Tasks\n\n";
    for (const phase of req.phases) {
      phaseSection += `### ${phase.name}\n`;
      for (const task of phase.tasks) {
        const fileList = task.filesChanged.length > 0
          ? ` (${task.filesChanged.length} files: ${task.filesChanged.slice(0, 5).join(", ")}${task.filesChanged.length > 5 ? "..." : ""})`
          : "";
        phaseSection += `- [${task.status}] ${task.title}${fileList}\n`;
      }
      phaseSection += "\n";
    }

    const prompt = [
      `## Project Description\n${req.projectDescription}\n`,
      phaseSection,
      fileSection,
      `## Cost\nTotal: $${req.totalCostUsd.toFixed(4)} (${req.totalTokensUsed} tokens)\n`,
      "",
      "Review this entire project. Provide an overall assessment of:",
      "1. What was built and why",
      "2. Architectural decisions made",
      "3. Overall code quality (1-10)",
      "4. Concerns or weaknesses",
      "5. Important decisions to remember for the future",
      "",
      "Respond with JSON ONLY in this format:",
      '{ "documentation": "markdown", "qualityScore": 7, "concerns": ["..."], "architecturalDecisions": ["..."], "memoriesExtracted": ["..."] }',
    ].join("\n");

    const systemPrompt = [
      "Review this complete project built by an AI agent.",
      "Provide a holistic assessment — not per-file, but the project as a whole.",
      "Focus on: architecture, code quality, security, testability, maintainability.",
      "Respond with valid JSON only.",
    ].join("\n");

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8192,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);
      return {
        documentation: parsed.documentation || "",
        qualityScore: parsed.qualityScore ?? 0,
        concerns: parsed.concerns || [],
        architecturalDecisions: parsed.architecturalDecisions || [],
        memoriesExtracted: parsed.memoriesExtracted || [],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch (err) {
      log.warn("reviewProject: JSON parse failed", { error: err instanceof Error ? err.message : String(err), responsePreview: response.content.substring(0, 500) });
      return {
        documentation: response.content,
        qualityScore: 0,
        concerns: ["Could not parse AI response as JSON — needs human review"],
        architecturalDecisions: [],
        memoriesExtracted: [],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

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

// --- Diagnosis & Plan Revision (DEL 2C) ---

export interface DiagnoseRequest {
  task: string;
  plan: TaskStep[];
  currentStep: number;
  error: string;
  previousErrors: string[];
  codeContext: string;
  model?: string;
}

export interface DiagnosisResult {
  rootCause: 'bad_plan' | 'implementation_error' | 'missing_context' | 'impossible_task' | 'environment_error';
  reason: string;
  suggestedAction: 'revise_plan' | 'fix_code' | 'fetch_more_context' | 'escalate_to_human' | 'retry';
  confidence: number;
}

export const diagnoseFailure = api(
  { method: "POST", path: "/ai/diagnose", expose: false },
  async (req: DiagnoseRequest): Promise<{ diagnosis: DiagnosisResult; tokensUsed: number; costUsd: number }> => {
    const model = req.model || DEFAULT_MODEL;

    const prompt = `You are diagnosing why a step in an autonomous coding task failed.

## Task
${req.task}

## Current Plan
${req.plan.map((s, i) => `${i + 1}. [${s.action}] ${s.description}${s.filePath ? ` (${s.filePath})` : ''}`).join('\n')}

## Failed at Step ${req.currentStep + 1}
Error: ${req.error}

${req.previousErrors.length > 0 ? `## Previous Errors in This Session\n${req.previousErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : ''}

## Code Context
${req.codeContext.substring(0, 3000)}

Analyze the root cause and suggest the best action. Respond with JSON only:
{
  "rootCause": "bad_plan|implementation_error|missing_context|impossible_task|environment_error",
  "reason": "specific explanation of what went wrong",
  "suggestedAction": "revise_plan|fix_code|fetch_more_context|escalate_to_human|retry",
  "confidence": 0.8
}

Root cause guidelines:
- bad_plan: The approach itself is wrong, need a different strategy
- implementation_error: Right approach, but code has bugs (typos, wrong API, logic error)
- missing_context: Need more information about the codebase or requirements
- impossible_task: The task cannot be done with current constraints
- environment_error: Transient issue (timeout, API down, network)`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: req.task,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content)) as DiagnosisResult;

      // Log skill usage
      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        diagnosis: parsed,
        tokensUsed: response.tokensUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);

      return {
        diagnosis: {
          rootCause: 'implementation_error',
          reason: 'Could not parse diagnosis — defaulting to implementation error',
          suggestedAction: 'fix_code',
          confidence: 0.3,
        },
        tokensUsed: response.tokensUsed,
        costUsd: response.costEstimate.totalCost,
      };
    }
  }
);

export interface RevisePlanRequest {
  task: string;
  originalPlan: TaskStep[];
  diagnosis: DiagnosisResult;
  constraints: string[];
  model?: string;
}

export const revisePlan = api(
  { method: "POST", path: "/ai/revise-plan", expose: false },
  async (req: RevisePlanRequest): Promise<AgentThinkResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const prompt = `You need to create a NEW plan for this task. The previous plan failed.

## Task
${req.task}

## Previous Plan (FAILED)
${req.originalPlan.map((s, i) => `${i + 1}. [${s.action}] ${s.description}`).join('\n')}

## Diagnosis
Root cause: ${req.diagnosis.rootCause}
Reason: ${req.diagnosis.reason}
Suggested action: ${req.diagnosis.suggestedAction}

## Constraints
${req.constraints.map((c) => `- ${c}`).join('\n')}

Create a DIFFERENT approach that avoids the previous failure. Respond with JSON:
{
  "plan": [{ "description": "...", "action": "create_file|modify_file|delete_file|run_command", "filePath": "...", "content": "...", "command": "..." }],
  "reasoning": "why this new approach will work"
}`;

    const pipeline = await buildSystemPromptWithPipeline("agent_planning", {
      task: req.task,
    });

    const response = await callAIWithFallback({
      model,
      system: pipeline.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 16384,
    });

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));

      // Log skill usage
      await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

      return {
        plan: parsed.plan,
        reasoning: parsed.reasoning,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      await logSkillResults(pipeline.skillIds, false, response.tokensUsed);
      throw APIError.internal("failed to parse revised plan as JSON");
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

      // Compute overall from breakdown if not provided
      if (!confidence.overall && confidence.breakdown) {
        const b = confidence.breakdown;
        confidence.overall = Math.round(
          (b.task_understanding +
            b.codebase_familiarity +
            b.technical_complexity +
            b.test_coverage_feasible) / 4
        );
      }

      // Determine recommended action if missing
      if (!confidence.recommended_action) {
        if (confidence.overall >= 75) {
          confidence.recommended_action = "proceed";
        } else if (confidence.overall >= 60) {
          confidence.recommended_action = "clarify";
        } else {
          confidence.recommended_action = "break_down";
        }
      }

      // Log skill usage
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
    // OWASP A03: Sanitize user message (may be very long project description)
    req.userMessage = sanitize(req.userMessage, { maxLength: 100_000 });

    // Use a higher-tier model for decomposition — this is architectural planning
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

    prompt += `Decompose this request into atomic tasks organized in phases. Respond with JSON only.`;

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

      // Validate structure
      if (!parsed.phases || !Array.isArray(parsed.phases)) {
        throw new Error("missing phases array");
      }

      // Validate dependsOnIndices consistency
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

      // Validate conventions length (<2000 tokens ~ <8000 chars)
      const conventions = parsed.conventions || "";
      if (conventions.length > 8000) {
        log.warn("conventions too long, truncating", { length: conventions.length });
      }

      // Log skill usage
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
    // Use a lower-tier model — this is a short meta-reasoning task
    const model = "claude-haiku-4-5-20251001";

    const completedSummary = req.completedPhase.tasks.map((t) => {
      const status = t.status === "completed" ? "\u2705" : t.status === "failed" ? "\u274C" : "\u23ED\uFE0F";
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

      // Revision parsing failed — return no changes (safe fallback)
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

// --- Task Order Planning (for tasks service) ---

interface PlanTaskOrderRequest {
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    labels: string[];
    dependsOn: string[];
  }>;
  repo: string;
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

    const prompt = `## Tasks for repo: ${req.repo}\n\n${taskList}\n\nAnalyze these tasks and return an optimal execution order as JSON.`;

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

      // Fallback: return tasks in original order with default complexity
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

// --- File Generation (for builder service) ---

interface GenerateFileRequest {
  task: string;
  fileSpec: {
    filePath: string;
    description: string;
    action: "create" | "modify";
    existingContent?: string;
  };
  existingFiles: Record<string, string>;
  projectStructure: string[];
  skillFragments: string[];
  patterns: Array<{ problem: string; solution: string }>;
  model?: string;
}

interface GenerateFileResponse {
  content: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const generateFile = api(
  { method: "POST", path: "/ai/generate-file", expose: false },
  async (req: GenerateFileRequest): Promise<GenerateFileResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const pipeline = await buildSystemPromptWithPipeline("agent_coding", {
      task: req.task,
      files: [req.fileSpec.filePath],
    });

    let systemPrompt = `Generate the requested file. Return ONLY the file content — no markdown blocks, no explanations, no comments about what you are doing. Just raw code.

Task: ${sanitize(req.task)}`;

    if (pipeline.systemPrompt) {
      systemPrompt += "\n\n" + pipeline.systemPrompt;
    }

    if (req.skillFragments.length > 0) {
      systemPrompt += "\n\n## Skill Instructions\n" + req.skillFragments.join("\n\n");
    }

    // Build user prompt with file-specific context
    let userPrompt = `## File to generate: ${req.fileSpec.filePath}\n`;
    userPrompt += `Action: ${req.fileSpec.action}\n`;
    if (req.fileSpec.description) {
      userPrompt += `Description: ${req.fileSpec.description}\n`;
    }

    if (req.fileSpec.action === "modify" && req.fileSpec.existingContent) {
      userPrompt += `\n## Existing content:\n\`\`\`\n${req.fileSpec.existingContent.substring(0, 20000)}\n\`\`\`\n`;
    }

    if (req.projectStructure.length > 0) {
      userPrompt += `\n## Project structure:\n${req.projectStructure.slice(0, 100).join("\n")}\n`;
    }

    const existingFileEntries = Object.entries(req.existingFiles);
    if (existingFileEntries.length > 0) {
      userPrompt += "\n## Context from completed files:\n";
      let contextTokens = 0;
      for (const [fpath, fcontent] of existingFileEntries) {
        const contentSlice = fcontent.substring(0, 8000);
        contextTokens += contentSlice.length / 4;
        if (contextTokens > 20000) break;
        userPrompt += `\n### ${fpath}\n\`\`\`\n${contentSlice}\n\`\`\`\n`;
      }
    }

    if (req.patterns.length > 0) {
      userPrompt += "\n## Relevant patterns:\n";
      for (const p of req.patterns.slice(0, 3)) {
        userPrompt += `- Problem: ${p.problem}\n  Solution: ${p.solution}\n`;
      }
    }

    userPrompt += "\n\nGenerate ONLY the file content. No markdown blocks, no explanations.";

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: sanitize(userPrompt) }],
      maxTokens: 16384,
    });

    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    // Strip any markdown code blocks the AI might still add
    let content = response.content;
    const codeBlockMatch = content.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }
    if (content.startsWith("```")) {
      content = content.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "");
    }

    return {
      content,
      tokensUsed: response.tokensUsed,
      modelUsed: response.modelUsed,
      costUsd: response.costEstimate.totalCost,
    };
  }
);

// --- Fix File (for builder service) ---

interface FixFileRequest {
  task: string;
  filePath: string;
  currentContent: string;
  errors: string[];
  existingFiles: Record<string, string>;
  model?: string;
}

interface FixFileResponse {
  content: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export const fixFile = api(
  { method: "POST", path: "/ai/fix-file", expose: false },
  async (req: FixFileRequest): Promise<FixFileResponse> => {
    const model = req.model || DEFAULT_MODEL;

    const systemPrompt = `Fix the TypeScript errors in this file. Return the CORRECTED file, complete, without markdown blocks or explanations. Just raw code.`;

    let userPrompt = `## Fix errors in: ${req.filePath}\n\n`;
    userPrompt += `## Errors:\n${req.errors.slice(0, 10).join("\n")}\n\n`;
    userPrompt += `## Current file content:\n\`\`\`\n${req.currentContent.substring(0, 20000)}\n\`\`\`\n`;

    const deps = Object.entries(req.existingFiles);
    if (deps.length > 0) {
      userPrompt += "\n## Related files:\n";
      for (const [depPath, depContent] of deps.slice(0, 5)) {
        userPrompt += `\n### ${depPath}\n\`\`\`\n${depContent.substring(0, 5000)}\n\`\`\`\n`;
      }
    }

    userPrompt += `\nOriginal task: ${req.task}\n\nReturn the COMPLETE corrected file. No markdown, no explanations.`;

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: sanitize(userPrompt) }],
      maxTokens: 16384,
    });

    let content = response.content;
    const codeBlockMatch = content.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }
    if (content.startsWith("```")) {
      content = content.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "");
    }

    return {
      content,
      tokensUsed: response.tokensUsed,
      modelUsed: response.modelUsed,
      costUsd: response.costEstimate.totalCost,
    };
  }
);

// --- Component Extraction (for registry service) ---

interface ExtractionRequest {
  task: string;
  repo: string;
  files: Array<{ path: string; content: string; lines: number }>;
}

interface ExtractionResponse {
  components: Array<{
    name: string;
    description: string;
    category: string;
    files: Array<{ path: string; content: string }>;
    entryPoint: string;
    dependencies: string[];
    tags: string[];
    qualityScore: number;
  }>;
}

export const callForExtraction = api(
  { method: "POST", path: "/ai/call-for-extraction", expose: false },
  async (req: ExtractionRequest): Promise<ExtractionResponse> => {
    const systemPrompt = `Analyze the provided files and identify up to 3 reusable, self-contained components.

A good component has:
- Clearly defined interface (exports)
- Low coupling to the rest of the project
- At least 50 lines of code (non-trivial)
- Reuse value in other projects
- Clear category

Categories: auth, payments, pdf, email, api, database, ui, utility, testing, devops

Return ONLY valid JSON without markdown blocks. Format:
{
  "components": [
    {
      "name": "kebab-case-name",
      "description": "Short description",
      "category": "category",
      "files": [{"path": "path", "content": ""}],
      "entryPoint": "main-file.ts",
      "dependencies": ["npm-package"],
      "tags": ["tag1", "tag2"],
      "qualityScore": 75
    }
  ]
}

If no reusable components are found, return: {"components": []}`;

    let userPrompt = `Repo: ${sanitize(req.repo)}\nTask: ${sanitize(req.task)}\n\nFiles:\n`;
    let tokenEstimate = 0;
    for (const f of req.files) {
      if (tokenEstimate > 15000) break;
      userPrompt += `\n--- ${f.path} (${f.lines} lines) ---\n${sanitize(f.content)}\n`;
      tokenEstimate += f.content.length / 4;
    }

    userPrompt += "\n\nIdentify reusable components from these files.";

    const response = await callAIWithFallback({
      model: "claude-sonnet-4-5-20250929", // Bruk rimelig modell
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 4096,
    });

    // Parse JSON-respons
    try {
      let content = response.content.trim();
      // Strip eventuelle markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)```/);
      if (jsonMatch) content = jsonMatch[1].trim();

      const parsed = JSON.parse(content);

      if (!parsed.components || !Array.isArray(parsed.components)) {
        return { components: [] };
      }

      return { components: parsed.components };
    } catch (parseErr) {
      log.warn("extraction AI response parse failed", {
        error: String(parseErr),
        contentPreview: response.content.substring(0, 200),
      });
      return { components: [] };
    }
  }
);

// --- D12: AI Memory Consolidation ---

interface ConsolidateMemoriesRequest {
  memories: Array<{ id: string; content: string; memoryType: string }>;
  context?: string;
}

interface ConsolidateMemoriesResponse {
  consolidatedContent: string;
  keyInsights: string[];
  tokensUsed: number;
  costUsd: number;
}

/**
 * Synthesize a cluster of related memories into a single consolidated insight.
 * Used by the Dream Engine (D11) weekly consolidation cron.
 */
export const consolidateMemories = api(
  { method: "POST", path: "/ai/consolidate-memories", expose: false },
  async (req: ConsolidateMemoriesRequest): Promise<ConsolidateMemoriesResponse> => {
    if (req.memories.length === 0) {
      return { consolidatedContent: "", keyInsights: [], tokensUsed: 0, costUsd: 0 };
    }

    // Use Haiku for cost efficiency — this runs in bulk weekly
    const model = "claude-haiku-4-5-20250929";

    const memorySections = req.memories
      .map((m, i) => `[Memory ${i + 1}] (type: ${m.memoryType})\n${m.content}`)
      .join("\n\n---\n\n");

    const contextNote = req.context ? `\nContext: ${req.context}\n` : "";

    const systemPrompt = `You are a memory consolidation assistant. Given a set of related memories,
synthesize them into a single, concise, actionable insight that captures the essential knowledge.
Do NOT simply concatenate — synthesize and distill.
Respond with valid JSON only, no markdown:
{
  "consolidated": "single paragraph synthesizing the key insight",
  "keyInsights": ["short insight 1", "short insight 2"]
}`;

    const userPrompt = `${contextNote}
Consolidate these ${req.memories.length} related memories into one synthesized insight:

${memorySections}

Respond with JSON only.`;

    const response = await callAIWithFallback({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1024,
    });

    let consolidatedContent = "";
    let keyInsights: string[] = [];

    try {
      const parsed = JSON.parse(stripMarkdownJson(response.content));
      consolidatedContent = parsed.consolidated ?? "";
      keyInsights = Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [];
    } catch {
      // Fallback: use the raw response as the consolidated content
      consolidatedContent = response.content.trim().substring(0, 1000);
      log.warn("consolidateMemories: JSON parse failed, using raw response");
    }

    return {
      consolidatedContent,
      keyInsights,
      tokensUsed: response.tokensUsed,
      costUsd: response.costEstimate.totalCost,
    };
  }
);
