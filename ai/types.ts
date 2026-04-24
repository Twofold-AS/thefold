// --- AI Service Types ---
// All interfaces and types used across ai/ modules and endpoint signatures.

import type { CostEstimate } from "./router";

// --- Chat Types ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Direct chat — quick response, no code execution
export interface ChatRequest {
  messages: ChatMessage[];
  memoryContext: string[];
  systemContext: "direct_chat" | "agent_planning" | "agent_coding" | "agent_review";
  model?: string; // Optional - uses DefaultAIModel if not set
  repoName?: string; // Which repo the user is chatting about (from repo-chat)
  repoOwner?: string; // GitHub owner/org for the repo
  repoContext?: string; // Actual file content from the repo (tree + relevant files)
  /**
   * Fase I.1 — Silent project context injected as a distinct system-prompt
   * section (NOT memoryContext). Used to scope answers, never parroted back.
   */
  projectContext?: string;
  conversationId?: string; // For tool-use (e.g. start_task needs conversation reference)
  aiName?: string; // User-configurable AI assistant name (default: "Jorgen Andre")
  complexity?: number; // 1-10 — used for auto model routing when model is not set
  activePlanId?: string; // §3.3: If set, filter create_task/start_task from CHAT_TOOLS + inject plan-context
  userEmail?: string; // Fase E: propagated to ToolContext so tool handlers can gate on role
  /** Gate web_scrape tool. When false, filter removes it from tool list for this turn. */
  firecrawlEnabled?: boolean;
  /** Project type — when set to "framer" or "framer_figma", design-platform
   *  rules are appended to the system prompt. */
  projectType?: "code" | "framer" | "figma" | "framer_figma";
  /** Chat.ts sets this when the user's message is a short social greeting.
   *  The prompt layer uses it to inject a short-reply register-match rule
   *  + caps max_tokens at a lower ceiling. Prevents "Hei" from producing
   *  a full orientation dump. */
  isSocialGreeting?: boolean;
}

export interface ChatResponse {
  content: string;
  tokensUsed: number;
  stopReason: string;
  modelUsed: string;
  /** U11 — short human-readable slug for UI (e.g. "Claude Sonnet"). Falls back to modelUsed if unresolved. */
  modelSlug?: string;
  costUsd: number;
  toolsUsed?: string[];
  lastCreatedTaskId?: string; // BUG 7 FIX: Pass task ID across chat turns
  lastStartedTaskId?: string; // Task ID when start_task was called directly (without create_task)
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  truncated: boolean;
  /** Skills resolved + injected for this turn. Mirrored from skills.resolve
   *  so the chat layer can persist them in message.metadata and the UI can
   *  render a SkillsCollapsible badge-row on the assistant message. */
  activeSkills?: Array<{ id: string; name: string; description?: string }>;
}

// --- Agent Types ---

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

// --- Code Generation Types ---

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

// --- Review Types ---

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

// --- Internal AI Call Types ---

export interface AICallOptions {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}

export interface AICallResponse {
  content: string;
  tokensUsed: number;
  stopReason: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costEstimate: CostEstimate;
}
