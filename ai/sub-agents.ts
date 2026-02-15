// Sub-agent types and role-to-model mapping for multi-agent orchestration

// --- Types ---

export type SubAgentRole = "implementer" | "tester" | "reviewer" | "documenter" | "researcher" | "planner";

export interface SubAgent {
  id: string;
  role: SubAgentRole;
  model: string;
  systemPrompt: string;
  inputContext: string;
  maxTokens: number;
  dependsOn: string[];
}

export interface SubAgentResult {
  id: string;
  role: SubAgentRole;
  model: string;
  output: string;
  costUsd: number;
  tokensUsed: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export type BudgetMode = "balanced" | "quality_first" | "aggressive_save";

// --- Role-to-Model Mapping ---

const BALANCED_MAP: Record<SubAgentRole, string> = {
  planner: "claude-sonnet-4-5-20250929",
  implementer: "claude-sonnet-4-5-20250929",
  tester: "claude-haiku-4-5-20251001",
  reviewer: "claude-sonnet-4-5-20250929",
  documenter: "claude-haiku-4-5-20251001",
  researcher: "claude-haiku-4-5-20251001",
};

const QUALITY_FIRST_MAP: Record<SubAgentRole, string> = {
  planner: "claude-sonnet-4-5-20250929",
  implementer: "claude-opus-4-5-20251101",
  tester: "claude-sonnet-4-5-20250929",
  reviewer: "claude-opus-4-5-20251101",
  documenter: "claude-sonnet-4-5-20250929",
  researcher: "claude-sonnet-4-5-20250929",
};

const AGGRESSIVE_SAVE_MAP: Record<SubAgentRole, string> = {
  planner: "claude-haiku-4-5-20251001",
  implementer: "claude-haiku-4-5-20251001",
  tester: "claude-haiku-4-5-20251001",
  reviewer: "claude-haiku-4-5-20251001",
  documenter: "claude-haiku-4-5-20251001",
  researcher: "claude-haiku-4-5-20251001",
};

export const ROLE_MODEL_MAP: Record<BudgetMode, Record<SubAgentRole, string>> = {
  balanced: BALANCED_MAP,
  quality_first: QUALITY_FIRST_MAP,
  aggressive_save: AGGRESSIVE_SAVE_MAP,
};

// --- Functions ---

export function getModelForRole(role: SubAgentRole, budgetMode: BudgetMode = "balanced"): string {
  return ROLE_MODEL_MAP[budgetMode][role];
}

// --- System Prompts per Role ---

const ROLE_SYSTEM_PROMPTS: Record<SubAgentRole, string> = {
  planner: `You are a technical planner sub-agent for TheFold.
Your job is to analyze a task and produce a detailed implementation plan.
Focus on file structure, dependencies, and execution order.
Output a JSON plan with steps, each containing: description, action, filePath, and reasoning.
Be precise — every file must be accounted for.`,

  implementer: `You are an implementation sub-agent for TheFold.
Your job is to write production-quality TypeScript code based on a plan.
Follow all Encore.ts conventions: api() for endpoints, SQLDatabase for databases, secret() for secrets.
Output complete file contents — no placeholders, no TODOs.
Focus on correctness, type safety, and following existing patterns.`,

  tester: `You are a testing sub-agent for TheFold.
Your job is to write comprehensive tests for the given code.
Use Vitest (describe/it/expect). Test happy paths, edge cases, and error scenarios.
For Encore.ts endpoints, call them as functions directly.
Output complete test file contents ready to run.`,

  reviewer: `You are a code review sub-agent for TheFold.
Your job is to review code changes for quality, correctness, and security.
Check for: OWASP vulnerabilities, type safety issues, missing error handling, Encore.ts convention violations.
Output a JSON review with: issues (severity + description), suggestions, qualityScore (1-10), and summary.`,

  documenter: `You are a documentation sub-agent for TheFold.
Your job is to write clear, concise documentation for code changes.
Include: what was built, why, how it connects to existing systems, and any configuration needed.
Output markdown documentation suitable for a PR description.`,

  researcher: `You are a research sub-agent for TheFold.
Your job is to search through provided context (memory, docs, code) and extract relevant information.
Summarize findings concisely with references to specific files or patterns.
Output a JSON summary with: findings[], relevantPatterns[], and recommendations[].`,
};

export function getSystemPromptForRole(role: SubAgentRole): string {
  return ROLE_SYSTEM_PROMPTS[role];
}

// --- Max Tokens per Role ---

const ROLE_MAX_TOKENS: Record<SubAgentRole, number> = {
  planner: 8192,
  implementer: 16384,
  tester: 8192,
  reviewer: 4096,
  documenter: 4096,
  researcher: 4096,
};

export function getMaxTokensForRole(role: SubAgentRole): number {
  return ROLE_MAX_TOKENS[role];
}
