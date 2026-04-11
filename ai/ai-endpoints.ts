import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { sanitize } from "./sanitize";
import { buildSystemPromptWithPipeline, logSkillResults } from "./prompts";
import { callAIWithFallback, stripMarkdownJson, DEFAULT_MODEL } from "./call";
import { callWithTools, CHAT_TOOLS } from "./tools";
import { assessComplexity } from "./ai-planning";

import type {
  ChatRequest, ChatResponse, ReviewRequest, ReviewResponse,
  AgentThinkResponse, TaskStep,
} from "./types";

// --- Direct chat ---

export const chat = api(
  { method: "POST", path: "/ai/chat", expose: false },
  async (req: ChatRequest): Promise<ChatResponse> => {
    const model = req.model || DEFAULT_MODEL;

    req.messages = req.messages.map((m) =>
      m.role === "user" ? { ...m, content: sanitize(m.content) } : m
    );

    const lastUserMsg = [...req.messages].reverse().find((m) => m.role === "user");
    const pipeline = await buildSystemPromptWithPipeline(req.systemContext, {
      task: lastUserMsg?.content || "",
    }, req.aiName);

    let system = pipeline.systemPrompt;

    if (req.repoName) {
      system += `\n\nYou are working in the repository: ${req.repoName}. When the user refers to "the repo", "the project", or "the code", they mean this specific repository.`;
      system += `\nIMPORTANT: If the user mentions a DIFFERENT repo name than "${req.repoName}", do NOT create a task for that other repo. Instead tell them to switch to the correct repo in the navigation bar first.`;
    } else {
      system += `\n\nThe user is in Global mode (no specific repo selected).`;
      system += `\nIf the user asks to create a NEW repo (e.g. "Create repo X"), proceed and create a task with the new repo name.`;
      system += `\nIf the user refers to an EXISTING repo (e.g. "Update the X repo"), tell them to switch to that repo in the navigation bar first.`;
    }

    if (req.repoContext) {
      system += `\n\n--- REPOSITORY CONTEXT ---\nThis is ACTUAL content from the repository. Base your answer ONLY on this — NEVER fabricate files or code not present here.\n${req.repoContext}`;
    }

    if (req.memoryContext.length > 0) {
      system += "\n\n## Relevant Context from Memory\n";
      req.memoryContext.forEach((m, i) => {
        system += `${i + 1}. ${m}\n`;
      });
    }

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
      lastStartedTaskId: toolResponse.lastStartedTaskId,
      usage: {
        inputTokens: toolResponse.inputTokens,
        outputTokens: toolResponse.outputTokens,
        totalTokens: toolResponse.inputTokens + toolResponse.outputTokens,
      },
      truncated: toolResponse.stopReason === "max_tokens",
    };
  }
);

// --- Code review and documentation ---

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

    await logSkillResults(pipeline.skillIds, true, response.tokensUsed);

    try {
      let jsonText = stripMarkdownJson(response.content);
      let parsed: Record<string, unknown>;

      try {
        parsed = JSON.parse(jsonText);
      } catch {
        const firstBrace = response.content.indexOf("{");
        const lastBrace = response.content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonText = response.content.substring(firstBrace, lastBrace + 1);
          parsed = JSON.parse(jsonText);
        } else {
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

    const MAX_FILE_TOKENS = 60000;
    let fileTokens = 0;
    let fileSection = "## All Files\n\n";
    const fullFiles: string[] = [];
    const summaryFiles: string[] = [];

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

// --- Diagnosis & Plan Revision ---

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
