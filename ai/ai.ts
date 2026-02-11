import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// --- Secrets ---
const anthropicKey = secret("AnthropicAPIKey");

// Optional secrets - will be checked at runtime
const openaiKey = secret("OpenAIAPIKey");
const moonshotKey = secret("MoonshotAPIKey");

// --- Constants ---
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

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

  return {
    content: text.text,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    stopReason: response.stop_reason || "end_turn",
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

  return {
    content: choice.message.content,
    tokensUsed: response.usage?.total_tokens || 0,
    stopReason: choice.finish_reason || "stop",
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

  return {
    content: choice.message.content,
    tokensUsed: response.usage?.total_tokens || 0,
    stopReason: choice.finish_reason || "stop",
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
6. Cache: ONLY use \`CacheCluster\` from "encore.dev/storage/cache"
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
};

// --- Endpoints ---

// Direct chat
export const chat = api(
  { method: "POST", path: "/ai/chat", expose: false },
  async (req: ChatRequest): Promise<ChatResponse> => {
    const model = req.model || DEFAULT_MODEL;

    let system = CONTEXT_PROMPTS[req.systemContext] || CONTEXT_PROMPTS.direct_chat;

    if (req.memoryContext.length > 0) {
      system += "\n\n## Relevant Context from Memory\n";
      req.memoryContext.forEach((m, i) => {
        system += `${i + 1}. ${m}\n`;
      });
    }

    const response = await callAI({
      model,
      system,
      messages: req.messages,
      maxTokens: 8192,
    });

    return {
      content: response.content,
      tokensUsed: response.tokensUsed,
      stopReason: response.stopReason,
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

    const response = await callAI({
      model,
      system: CONTEXT_PROMPTS.agent_planning,
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

    const response = await callAI({
      model,
      system: CONTEXT_PROMPTS.agent_review,
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
      };
    } catch {
      throw APIError.internal("failed to parse review response");
    }
  }
);
