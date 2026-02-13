import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { skills } from "~encore/clients";
import { estimateCost, getUpgradeModel, type CostEstimate } from "./router";

// --- Secrets ---
const anthropicKey = secret("AnthropicAPIKey");

// Optional secrets - will be checked at runtime
const openaiKey = secret("OpenAIAPIKey");
const moonshotKey = secret("MoonshotAPIKey");

// --- Constants ---
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_FALLBACK_UPGRADES = 2;

// --- Types ---

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Direct chat — quick response, no code execution
export interface ChatRequest {
  messages: ChatMessage[];
  memoryContext: string[];
  systemContext: "direct_chat" | "agent_planning" | "agent_coding" | "agent_review";
  model?: string; // Optional - uses DefaultAIModel if not set
}

export interface ChatResponse {
  content: string;
  tokensUsed: number;
  stopReason: string;
  modelUsed: string;
  costUsd: number;
}

// Structured agent call — returns JSON for the agent to parse
export interface AgentThinkRequest {
  task: string;
  projectStructure: string; // file tree from GitHub
  relevantFiles: FileContent[]; // actual file contents
  memoryContext: string[];
  docsContext: string[]; // from Context7
  previousAttempt?: string; // if retrying after error
  errorMessage?: string; // the error to fix
  model?: string; // Optional - uses DefaultAIModel if not set
}

export interface FileContent {
  path: string;
  content: string;
}

export interface AgentThinkResponse {
  plan: TaskStep[];
  reasoning: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export interface TaskStep {
  description: string;
  action: "create_file" | "modify_file" | "delete_file" | "run_command";
  filePath?: string;
  content?: string; // for create_file: full content. for modify_file: new content
  command?: string; // for run_command
}

// Code generation — returns actual file contents
export interface CodeGenRequest {
  step: TaskStep;
  projectContext: string; // relevant surrounding code
  memoryContext: string[];
  docsContext: string[];
  encoreRules: boolean; // enforce Encore conventions
  model?: string; // Optional - uses DefaultAIModel if not set
}

export interface CodeGenResponse {
  files: GeneratedFile[];
  explanation: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

export interface GeneratedFile {
  path: string;
  content: string;
  action: "create" | "modify" | "delete";
}

// Code review — analyzes what was built, produces documentation
export interface ReviewRequest {
  taskDescription: string;
  filesChanged: GeneratedFile[];
  validationOutput: string;
  memoryContext: string[];
  model?: string; // Optional - uses DefaultAIModel if not set
}

export interface ReviewResponse {
  documentation: string; // markdown doc for Linear/PR
  memoriesExtracted: string[]; // key decisions to remember
  qualityScore: number; // 1-10 self-assessment
  concerns: string[]; // any issues found
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

// --- AI Provider Detection ---

type AIProvider = "anthropic" | "openai" | "moonshot";

function getProvider(modelName: string): AIProvider {
  if (modelName.startsWith("claude-")) return "anthropic";
  if (modelName.startsWith("gpt-")) return "openai";
  if (modelName.startsWith("moonshot-")) return "moonshot";
  throw APIError.invalidArgument(`Unknown model: ${modelName}`);
}

// --- Helper Functions ---

function stripMarkdownJson(text: string): string {
  let jsonText = text.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }
  return jsonText;
}

interface AICallOptions {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}

interface AICallResponse {
  content: string;
  tokensUsed: number;
  stopReason: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  costEstimate: CostEstimate;
}

async function callAI(options: AICallOptions): Promise<AICallResponse> {
  const provider = getProvider(options.model);

  switch (provider) {
    case "anthropic":
      return callAnthropic(options);
    case "openai":
      return callOpenAI(options);
    case "moonshot":
      return callMoonshot(options);
  }
}

/**
 * Call AI with automatic fallback — if the model fails, upgrade to next tier.
 * Retries up to MAX_FALLBACK_UPGRADES times with progressively better models.
 */
async function callAIWithFallback(options: AICallOptions): Promise<AICallResponse> {
  let currentModel = options.model;
  let attempts = 0;

  while (attempts <= MAX_FALLBACK_UPGRADES) {
    try {
      return await callAI({ ...options, model: currentModel });
    } catch (error) {
      attempts++;
      const upgrade = getUpgradeModel(currentModel);

      if (!upgrade || attempts > MAX_FALLBACK_UPGRADES) {
        throw error; // No upgrade path or max attempts reached
      }

      // Upgrade to next tier and retry
      currentModel = upgrade;
    }
  }

  // Should not reach here, but TypeScript needs it
  throw APIError.internal("model fallback exhausted");
}

async function callAnthropic(options: AICallOptions): Promise<AICallResponse> {
  const client = new Anthropic({ apiKey: anthropicKey() });

  const response = await client.messages.create({
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.system,
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content.find((c) => c.type === "text");
  if (!text || text.type !== "text") {
    throw APIError.internal("no text in Anthropic response");
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  return {
    content: text.text,
    tokensUsed: inputTokens + outputTokens,
    stopReason: response.stop_reason || "end_turn",
    modelUsed: options.model,
    inputTokens,
    outputTokens,
    costEstimate: estimateCost(inputTokens, outputTokens, options.model),
  };
}

async function callOpenAI(options: AICallOptions): Promise<AICallResponse> {
  let apiKey: string;
  try {
    apiKey = openaiKey();
  } catch {
    throw APIError.failedPrecondition(
      "OpenAI provider not configured. Set OpenAIAPIKey secret."
    );
  }

  const client = new OpenAI({ apiKey });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: options.system },
    ...options.messages,
  ];

  const response = await client.chat.completions.create({
    model: options.model,
    max_tokens: options.maxTokens,
    messages,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw APIError.internal("no content in OpenAI response");
  }

  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;

  return {
    content: choice.message.content,
    tokensUsed: response.usage?.total_tokens || 0,
    stopReason: choice.finish_reason || "stop",
    modelUsed: options.model,
    inputTokens,
    outputTokens,
    costEstimate: estimateCost(inputTokens, outputTokens, options.model),
  };
}

async function callMoonshot(options: AICallOptions): Promise<AICallResponse> {
  let apiKey: string;
  try {
    apiKey = moonshotKey();
  } catch {
    throw APIError.failedPrecondition(
      "Moonshot provider not configured. Set MoonshotAPIKey secret."
    );
  }

  // Moonshot uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.moonshot.cn/v1",
  });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: options.system },
    ...options.messages,
  ];

  const response = await client.chat.completions.create({
    model: options.model,
    max_tokens: options.maxTokens,
    messages,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw APIError.internal("no content in Moonshot response");
  }

  const inputTokensMoon = response.usage?.prompt_tokens || 0;
  const outputTokensMoon = response.usage?.completion_tokens || 0;

  return {
    content: choice.message.content,
    tokensUsed: response.usage?.total_tokens || 0,
    stopReason: choice.finish_reason || "stop",
    modelUsed: options.model,
    inputTokens: inputTokensMoon,
    outputTokens: outputTokensMoon,
    costEstimate: estimateCost(inputTokensMoon, outputTokensMoon, options.model),
  };
}

// --- System Prompts ---

const BASE_RULES = `You are TheFold, an autonomous internal fullstack developer.

## Absolute Rules — NEVER break these
1. Backend APIs: ONLY use \`api()\` from "encore.dev/api"
2. Secrets: ONLY use \`secret()\` from "encore.dev/config" — NEVER hardcode, NEVER use dotenv
3. Databases: ONLY use \`SQLDatabase\` from "encore.dev/storage/sqldb"
4. Pub/Sub: ONLY use \`Topic\`/\`Subscription\` from "encore.dev/pubsub"
5. Cron: ONLY use \`CronJob\` from "encore.dev/cron"
6. Cache: Use the cache service via \`~encore/clients\` (PostgreSQL-backed until CacheCluster is available)
7. NEVER use Express, Fastify, Hono, Koa, or any HTTP framework
8. NEVER use process.env, dotenv, or .env files for secrets
9. NEVER hardcode API keys, tokens, passwords, or connection strings
10. ALWAYS use TypeScript strict mode patterns

## Quality Standards
- Every function must have a clear single responsibility
- Error handling must be explicit — no silent failures
- All user-facing strings in Norwegian unless specified otherwise
- SQL migrations must be idempotent where possible
- Test coverage for critical paths`;

const CONTEXT_PROMPTS: Record<string, string> = {
  direct_chat: `${BASE_RULES}

You are chatting directly with a team member. Be helpful, concise, and technical.
If they ask about code, reference the actual project files you know about.
If you suggest changes, explain why clearly.`,

  agent_planning: `${BASE_RULES}

You are planning how to implement a task. Respond with a JSON object:
{
  "plan": [
    {
      "description": "what this step does",
      "action": "create_file|modify_file|delete_file|run_command",
      "filePath": "path/to/file.ts",
      "content": "file content or null",
      "command": "npm install x or null"
    }
  ],
  "reasoning": "why this approach"
}

Be precise. Every file must be complete — no placeholders, no "// TODO", no "...".
Read the existing code carefully before modifying. Maintain existing patterns.`,

  agent_coding: `${BASE_RULES}

You are generating production code. Return ONLY the complete file content.
No markdown fences, no explanations — just the code.
The code must be complete, correct, and follow all Encore.ts conventions.
Read Context7 docs carefully for correct API usage.`,

  agent_review: `${BASE_RULES}

You are reviewing code you just wrote. Be honest and critical.
Respond with JSON:
{
  "documentation": "markdown describing what was built and why",
  "memoriesExtracted": ["key decision 1", "architectural choice 2"],
  "qualityScore": 8,
  "concerns": ["potential issue 1"]
}`,

  confidence_assessment: `${BASE_RULES}

You are assessing your own confidence in completing a task.

Be HONEST and CRITICAL. It's better to ask for clarification than to fail.

Analyze:
1. **Task Understanding (0-100):**
   - Is the task clearly defined?
   - Are there ambiguous requirements?
   - Do I understand the desired outcome?

2. **Codebase Familiarity (0-100):**
   - Have I seen this project structure before?
   - Do I understand the existing patterns?
   - Can I locate where changes should be made?

3. **Technical Complexity (0-100):**
   - Is this technically feasible?
   - Do I have the right tools/libraries?
   - Are there obvious blockers?

4. **Test Coverage Feasible (0-100):**
   - Can I write tests for this?
   - Are there existing test patterns to follow?
   - Is the change testable?

**Scoring Guidelines:**
- 90-100: Very confident, proceed immediately
- 70-89: Confident with minor uncertainties, proceed with caution
- 50-69: Moderate confidence, clarify specific points first
- Below 50: Low confidence, either clarify OR break into subtasks

**Recommended Actions:**
- "proceed": All scores >70, no major uncertainties
- "clarify": Some scores <70, need specific questions answered
- "break_down": Overall <60, task is too large/complex

Respond with JSON only matching this exact shape:
{
  "overall": 85,
  "breakdown": {
    "task_understanding": 90,
    "codebase_familiarity": 80,
    "technical_complexity": 85,
    "test_coverage_feasible": 80
  },
  "uncertainties": ["specific thing I'm unsure about"],
  "recommended_action": "proceed",
  "clarifying_questions": [],
  "suggested_subtasks": []
}

Be specific about uncertainties and questions. Never say "I'm not sure" — say exactly WHAT you're not sure about.`,
};

// --- Skills Integration ---

// Map systemContext to skills context
const CONTEXT_TO_SKILLS_CONTEXT: Record<string, string> = {
  direct_chat: "chat",
  agent_planning: "planning",
  agent_coding: "coding",
  agent_review: "review",
  confidence_assessment: "planning",
};

async function buildSystemPromptWithSkills(baseContext: string): Promise<string> {
  const basePrompt = CONTEXT_PROMPTS[baseContext] || CONTEXT_PROMPTS.direct_chat;
  const skillsContext = CONTEXT_TO_SKILLS_CONTEXT[baseContext] || "coding";

  try {
    const activeSkills = await skills.getActiveSkills({ context: skillsContext });

    if (activeSkills.promptFragments.length === 0) {
      return basePrompt;
    }

    let prompt = basePrompt;
    prompt += "\n\n## Active Skills\n";
    for (const fragment of activeSkills.promptFragments) {
      prompt += `\n${fragment}\n`;
    }

    return prompt;
  } catch {
    // If skills service is unavailable, use base prompt
    return basePrompt;
  }
}

// --- Endpoints ---

// Direct chat
export const chat = api(
  { method: "POST", path: "/ai/chat", expose: false },
  async (req: ChatRequest): Promise<ChatResponse> => {
    const model = req.model || DEFAULT_MODEL;

    let system = await buildSystemPromptWithSkills(req.systemContext);

    if (req.memoryContext.length > 0) {
      system += "\n\n## Relevant Context from Memory\n";
      req.memoryContext.forEach((m, i) => {
        system += `${i + 1}. ${m}\n`;
      });
    }

    const response = await callAIWithFallback({
      model,
      system,
      messages: req.messages,
      maxTokens: 8192,
    });

    return {
      content: response.content,
      tokensUsed: response.tokensUsed,
      stopReason: response.stopReason,
      modelUsed: response.modelUsed,
      costUsd: response.costEstimate.totalCost,
    };
  }
);

// Agent planning — breaks task into steps
export const planTask = api(
  { method: "POST", path: "/ai/plan", expose: false },
  async (req: AgentThinkRequest): Promise<AgentThinkResponse> => {
    const model = req.model || DEFAULT_MODEL;

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

    const system = await buildSystemPromptWithSkills("agent_planning");

    const response = await callAIWithFallback({
      model,
      system,
      messages,
      maxTokens: 16384,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);
      return {
        plan: parsed.plan,
        reasoning: parsed.reasoning,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      throw APIError.internal("failed to parse planning response as JSON");
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

    const system = await buildSystemPromptWithSkills("agent_review");

    const response = await callAIWithFallback({
      model,
      system,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8192,
    });

    try {
      const jsonText = stripMarkdownJson(response.content);
      const parsed = JSON.parse(jsonText);
      return {
        documentation: parsed.documentation,
        memoriesExtracted: parsed.memoriesExtracted || [],
        qualityScore: parsed.qualityScore || 5,
        concerns: parsed.concerns || [],
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      throw APIError.internal("failed to parse review response");
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

    const system = await buildSystemPromptWithSkills("confidence_assessment");

    const response = await callAIWithFallback({
      model,
      system,
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

      return {
        confidence,
        tokensUsed: response.tokensUsed,
        modelUsed: response.modelUsed,
        costUsd: response.costEstimate.totalCost,
      };
    } catch {
      throw APIError.internal("failed to parse confidence assessment as JSON");
    }
  }
);
