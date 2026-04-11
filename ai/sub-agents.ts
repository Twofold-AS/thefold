// Sub-agent types and role-to-model mapping for multi-agent orchestration

// --- Types ---

export type SubAgentRole = "implementer" | "tester" | "reviewer" | "documenter" | "researcher" | "planner" | "security";

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

// BudgetMode kept as type alias for backward compatibility but ignored in routing
export type BudgetMode = "balanced" | "quality_first" | "aggressive_save";

// --- Role-to-Model Mapping (tag-based, not cost-based) ---

const ROLE_MODEL_MAP: Record<SubAgentRole, string> = {
  planner: "claude-sonnet-4-5-20250929",
  implementer: "claude-sonnet-4-5-20250929",
  tester: "claude-haiku-4-5-20251001",
  reviewer: "claude-sonnet-4-5-20250929",
  documenter: "claude-haiku-4-5-20251001",
  researcher: "claude-haiku-4-5-20251001",
  security: "claude-sonnet-4-5-20250929",
};

// --- Functions ---

export function getModelForRole(role: SubAgentRole, _budgetMode?: BudgetMode): string {
  return ROLE_MODEL_MAP[role];
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
Your job is to deeply analyze the provided context — including past task memories, documentation, and code patterns — and extract actionable insights.
Focus on:
- Similar patterns or solutions from past tasks (look for [MEMORY] sections)
- Relevant library APIs and documentation (look for [DOCS] sections)
- Existing code conventions and architectural patterns in the codebase
- Potential pitfalls or known issues from previous attempts

Output a JSON summary with:
{
  "findings": ["key insight 1", "key insight 2"],
  "relevantPatterns": [{ "pattern": "...", "source": "memory|docs|code", "applicability": "high|medium|low" }],
  "recommendations": ["concrete recommendation 1", "concrete recommendation 2"],
  "memoriesUsed": ["memory snippet 1"],
  "docsUsed": ["doc reference 1"]
}`,

  security: `You are a security audit sub-agent for TheFold.
Your job is to scan generated code and plans for security vulnerabilities before deployment.
Check for:
- Hardcoded secrets, API keys, passwords, or tokens in code
- SQL injection vulnerabilities (unparameterized queries, string concatenation in SQL)
- XSS vulnerabilities (unescaped user input rendered in HTML/responses)
- OWASP A01-A10 vulnerabilities (broken access control, cryptographic failures, injection, etc.)
- Insecure direct object references (accessing resources without ownership check)
- Missing authentication/authorization checks on sensitive endpoints
- Prototype pollution, path traversal, command injection
- Encore.ts-specific: ensure all DB queries use tagged templates (db.query\`...\`), all secrets use secret(), no process.env

Output a JSON report:
{
  "vulnerabilities": [{ "severity": "critical|high|medium|low", "type": "...", "location": "file or endpoint", "description": "...", "fix": "specific fix recommendation" }],
  "overallRisk": "critical|high|medium|low|none",
  "securityScore": 8,
  "summary": "brief overall security assessment",
  "passedChecks": ["check 1 passed", "check 2 passed"]
}`,
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
  security: 4096,
};

export function getMaxTokensForRole(role: SubAgentRole): number {
  return ROLE_MAX_TOKENS[role];
}
