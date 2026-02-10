import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import Anthropic from "@anthropic-ai/sdk";

const anthropicKey = secret("AnthropicAPIKey");

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
}

export interface ChatResponse {
  content: string;
  tokensUsed: number;
  stopReason: string;
}

// Structured agent call — returns JSON for the agent to parse
export interface AgentThinkRequest {
  task: string;
  projectStructure: string;       // file tree from GitHub
  relevantFiles: FileContent[];    // actual file contents
  memoryContext: string[];
  docsContext: string[];           // from Context7
  previousAttempt?: string;        // if retrying after error
  errorMessage?: string;           // the error to fix
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
  content?: string;         // for create_file: full content. for modify_file: new content
  command?: string;          // for run_command
}

// Code generation — returns actual file contents
export interface CodeGenRequest {
  step: TaskStep;
  projectContext: string;          // relevant surrounding code
  memoryContext: string[];
  docsContext: string[];
  encoreRules: boolean;            // enforce Encore conventions
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
}

export interface ReviewResponse {
  documentation: string;         // markdown doc for Linear/PR
  memoriesExtracted: string[];   // key decisions to remember
  qualityScore: number;          // 1-10 self-assessment
  concerns: string[];            // any issues found
  tokensUsed: number;
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
    const client = new Anthropic({ apiKey: anthropicKey() });

    let system = CONTEXT_PROMPTS[req.systemContext] || CONTEXT_PROMPTS.direct_chat;

    if (req.memoryContext.length > 0) {
      system += "\n\n## Relevant Context from Memory\n";
      req.memoryContext.forEach((m, i) => {
        system += `${i + 1}. ${m}\n`;
      });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") throw APIError.internal("no text in AI response");

    return {
      content: text.text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      stopReason: response.stop_reason || "end_turn",
    };
  }
);

// Agent planning — breaks task into steps
export const planTask = api(
  { method: "POST", path: "/ai/plan", expose: false },
  async (req: AgentThinkRequest): Promise<AgentThinkResponse> => {
    const client = new Anthropic({ apiKey: anthropicKey() });

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

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      system: CONTEXT_PROMPTS.agent_planning,
      messages: [
        { role: "user", content: prompt },
        ...(req.memoryContext.length > 0
          ? [{ role: "user" as const, content: `Relevant memories:\n${req.memoryContext.join("\n")}` }]
          : []),
      ],
    });

    const text = response.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") throw APIError.internal("no text in planning response");

    try {
      const parsed = JSON.parse(text.text);
      return {
        plan: parsed.plan,
        reasoning: parsed.reasoning,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
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
    const client = new Anthropic({ apiKey: anthropicKey() });

    let prompt = `## Task\n${req.taskDescription}\n\n`;
    prompt += `## Files Changed\n`;
    req.filesChanged.forEach((f) => {
      prompt += `### ${f.path} (${f.action})\n\`\`\`\n${f.content}\n\`\`\`\n\n`;
    });
    prompt += `## Validation Output\n\`\`\`\n${req.validationOutput}\n\`\`\`\n\n`;
    prompt += `Review this work. Respond with JSON only.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: CONTEXT_PROMPTS.agent_review,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") throw APIError.internal("no text in review response");

    try {
      const parsed = JSON.parse(text.text);
      return {
        documentation: parsed.documentation,
        memoriesExtracted: parsed.memoriesExtracted || [],
        qualityScore: parsed.qualityScore || 5,
        concerns: parsed.concerns || [],
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      };
    } catch {
      throw APIError.internal("failed to parse review response");
    }
  }
);
