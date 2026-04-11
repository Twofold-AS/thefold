// Sub-agent orchestration: planning, parallel execution, and result merging

import log from "encore.dev/log";
import { callAIWithFallback } from "./call";
import { estimateCost } from "./router";
import {
  type SubAgent,
  type SubAgentResult,
  type SubAgentRole,
  type BudgetMode,
  getModelForRole,
  getSystemPromptForRole,
  getMaxTokensForRole,
} from "./sub-agents";

// --- Types ---

export interface SubAgentPlan {
  agents: SubAgent[];
  mergeStrategy: "concatenate" | "ai_merge";
}

// --- Agent-to-agent shared context (9.2) ---

export interface AgentMessage {
  fromRole: SubAgentRole;
  toRole: SubAgentRole | "all";
  content: string;
  timestamp: number;
  type: "finding" | "feedback" | "context";
}

export interface SharedAgentContext {
  messages: AgentMessage[];
  securityFindings?: string;
  testFindings?: string;
  write(from: SubAgentRole, to: SubAgentRole | "all", content: string, type?: AgentMessage["type"]): void;
  read(role: SubAgentRole): AgentMessage[];
}

export function createSharedAgentContext(): SharedAgentContext {
  const messages: AgentMessage[] = [];
  return {
    messages,
    securityFindings: undefined,
    testFindings: undefined,
    write(from, to, content, type = "context") {
      messages.push({ fromRole: from, toRole: to, content, timestamp: Date.now(), type });
    },
    read(role) {
      return messages.filter((m) => m.toRole === "all" || m.toRole === role);
    },
  };
}

// --- Callbacks for real-time progress reporting (9.3) ---

export interface SubAgentCallbacks {
  onAgentStart?: (agent: SubAgent) => void | Promise<void>;
  onAgentComplete?: (result: SubAgentResult) => void | Promise<void>;
}

// --- Planning ---

/**
 * Plan which sub-agents to dispatch based on task complexity.
 * - complexity < 5: no sub-agents (empty plan)
 * - complexity 5-7: implementer + tester (parallel)
 * - complexity 8-9: planner → implementer + tester + reviewer (parallel after planner)
 * - complexity 10: full team including documenter
 */
export function planSubAgents(
  taskDescription: string,
  planSummary: string,
  complexity: number,
  budgetMode: BudgetMode = "balanced"
): SubAgentPlan {
  if (complexity < 5) {
    return { agents: [], mergeStrategy: "concatenate" };
  }

  const agents: SubAgent[] = [];
  let idCounter = 0;
  const nextId = () => `sub-${++idCounter}`;

  if (complexity >= 8) {
    // Planner first — others depend on it
    const plannerId = nextId();
    agents.push({
      id: plannerId,
      role: "planner",
      model: getModelForRole("planner", budgetMode),
      systemPrompt: getSystemPromptForRole("planner"),
      inputContext: `Task: ${taskDescription}\n\nExisting plan:\n${planSummary}`,
      maxTokens: getMaxTokensForRole("planner"),
      dependsOn: [],
    });

    // Implementer depends on planner
    agents.push({
      id: nextId(),
      role: "implementer",
      model: getModelForRole("implementer", budgetMode),
      systemPrompt: getSystemPromptForRole("implementer"),
      inputContext: `Task: ${taskDescription}`,
      maxTokens: getMaxTokensForRole("implementer"),
      dependsOn: [plannerId],
    });

    // Tester depends on planner
    agents.push({
      id: nextId(),
      role: "tester",
      model: getModelForRole("tester", budgetMode),
      systemPrompt: getSystemPromptForRole("tester"),
      inputContext: `Task: ${taskDescription}`,
      maxTokens: getMaxTokensForRole("tester"),
      dependsOn: [plannerId],
    });

    // Reviewer depends on planner
    agents.push({
      id: nextId(),
      role: "reviewer",
      model: getModelForRole("reviewer", budgetMode),
      systemPrompt: getSystemPromptForRole("reviewer"),
      inputContext: `Task: ${taskDescription}`,
      maxTokens: getMaxTokensForRole("reviewer"),
      dependsOn: [plannerId],
    });

    // Security agent depends on planner — always included at complexity >= 8
    const implementerId = agents.find((a) => a.role === "implementer")?.id ?? plannerId;
    agents.push({
      id: nextId(),
      role: "security",
      model: getModelForRole("security", budgetMode),
      systemPrompt: getSystemPromptForRole("security"),
      inputContext: `Task: ${taskDescription}`,
      maxTokens: getMaxTokensForRole("security"),
      dependsOn: [implementerId],
    });

    // Documenter only at complexity 10
    if (complexity >= 10) {
      agents.push({
        id: nextId(),
        role: "documenter",
        model: getModelForRole("documenter", budgetMode),
        systemPrompt: getSystemPromptForRole("documenter"),
        inputContext: `Task: ${taskDescription}`,
        maxTokens: getMaxTokensForRole("documenter"),
        dependsOn: [plannerId],
      });
    }

    return { agents, mergeStrategy: "ai_merge" };
  }

  // Complexity 5-7: implementer + tester in parallel
  agents.push({
    id: nextId(),
    role: "implementer",
    model: getModelForRole("implementer", budgetMode),
    systemPrompt: getSystemPromptForRole("implementer"),
    inputContext: `Task: ${taskDescription}\n\nPlan:\n${planSummary}`,
    maxTokens: getMaxTokensForRole("implementer"),
    dependsOn: [],
  });

  agents.push({
    id: nextId(),
    role: "tester",
    model: getModelForRole("tester", budgetMode),
    systemPrompt: getSystemPromptForRole("tester"),
    inputContext: `Task: ${taskDescription}\n\nPlan:\n${planSummary}`,
    maxTokens: getMaxTokensForRole("tester"),
    dependsOn: [],
  });

  return { agents, mergeStrategy: "concatenate" };
}

// --- Dynamic Planning (ZN: AI-driven sub-agent setup) ---

/**
 * AI-driven sub-agent planning. Uses an AI call to decide which sub-agents
 * to dispatch based on the actual task content, not just a complexity number.
 *
 * Feature-flagged via DynamicSubAgentsEnabled secret. Falls back to planSubAgents()
 * when disabled or on any error.
 */
export async function planSubAgentsDynamic(
  taskDescription: string,
  planSummary: string,
  complexity: number,
  budgetMode: BudgetMode,
  userHint?: string,
): Promise<SubAgentPlan> {
  try {
    const plannerPrompt = `You are a planner that decides if a coding task needs sub-agents.
Analyze the task and decide:
1. Does this task need sub-agents? (simple bug fixes, single-file changes: no)
2. If yes: which roles are needed, and what should each focus on?
3. Dependencies between agents (e.g. tester depends on implementer)

Available roles: planner, implementer, tester, reviewer, documenter, researcher

Rules:
- Only use sub-agents when the task genuinely benefits from parallel specialized work
- Complexity 1-3 tasks almost never need sub-agents
- A task with many files or systems benefits from planner + implementer + tester
- Security-sensitive tasks benefit from a reviewer
- Large new features benefit from a documenter
- When in doubt, use fewer agents (cost efficiency)

Respond with JSON only (no markdown fences):
{
  "useSubAgents": true/false,
  "reason": "short explanation of why or why not",
  "agents": [
    { "role": "implementer", "task": "specific focus for this agent", "dependsOn": [] },
    { "role": "tester", "task": "specific focus for this agent", "dependsOn": ["implementer"] }
  ]
}`;

    const userMessage = [
      `Task: ${taskDescription}`,
      `\nPlan summary:\n${planSummary}`,
      `\nComplexity: ${complexity}/10`,
      userHint ? `\nUser preference: ${userHint}` : "",
    ].filter(Boolean).join("\n");

    const response = await callAIWithFallback({
      model: getModelForRole("planner", budgetMode),
      system: plannerPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 2048,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn("planSubAgentsDynamic: no JSON found in AI response, falling back", {
        responseLength: response.content.length,
      });
      return planSubAgents(taskDescription, planSummary, complexity, budgetMode);
    }

    const decision = JSON.parse(jsonMatch[0]) as {
      useSubAgents: boolean;
      reason: string;
      agents?: Array<{
        role: string;
        task: string;
        dependsOn?: string[];
      }>;
    };

    log.info("planSubAgentsDynamic: AI decision", {
      useSubAgents: decision.useSubAgents,
      reason: decision.reason,
      agentCount: decision.agents?.length ?? 0,
      complexity,
    });

    if (!decision.useSubAgents || !decision.agents?.length) {
      return { agents: [], mergeStrategy: "concatenate" };
    }

    // Validate and map roles — only accept known roles
    const validRoles: Set<string> = new Set(["planner", "implementer", "tester", "reviewer", "documenter", "researcher", "security"]);
    const validAgents = decision.agents.filter((a) => validRoles.has(a.role));

    if (validAgents.length === 0) {
      log.warn("planSubAgentsDynamic: no valid roles in AI response, falling back");
      return planSubAgents(taskDescription, planSummary, complexity, budgetMode);
    }

    const agents: SubAgent[] = validAgents.map((a, i) => ({
      id: `sub-${i + 1}`,
      role: a.role as SubAgentRole,
      model: getModelForRole(a.role as SubAgentRole, budgetMode),
      systemPrompt: getSystemPromptForRole(a.role as SubAgentRole),
      inputContext: `${a.task}\n\nTask: ${taskDescription}`,
      maxTokens: getMaxTokensForRole(a.role as SubAgentRole),
      dependsOn: (a.dependsOn || [])
        .map((dep: string) => {
          const idx = validAgents.findIndex((d) => d.role === dep);
          return idx >= 0 ? `sub-${idx + 1}` : "";
        })
        .filter(Boolean),
    }));

    return {
      agents,
      mergeStrategy: agents.length > 3 ? "ai_merge" : "concatenate",
    };
  } catch (err) {
    log.warn("planSubAgentsDynamic: error, falling back to static planning", {
      error: err instanceof Error ? err.message : String(err),
    });
    return planSubAgents(taskDescription, planSummary, complexity, budgetMode);
  }
}

// --- User Hint Extraction ---

/**
 * Extract sub-agent preferences from a user message.
 * Detects patterns like "bruk 3 agenter", "2 sub-agents", "uten sub-agent".
 */
export function extractSubAgentHint(message: string): string | undefined {
  const patterns = [
    /bruk\s+(\d+)\s+agent/i,
    /(\d+)\s+sub-?agent/i,
    /parallell.*?(\d+)/i,
    /team.*?(\d+)/i,
  ];
  for (const p of patterns) {
    const match = message.match(p);
    if (match) return `User wants ${match[1]} agents`;
  }
  if (/uten sub-?agent/i.test(message)) return "User wants NO sub-agents";
  return undefined;
}

// --- Execution ---

/**
 * Execute sub-agents respecting dependency ordering.
 * Agents with no unresolved deps run in parallel via Promise.allSettled.
 * Completed agents' output is fed as inputContext to dependents.
 * SharedAgentContext enables agent-to-agent message passing (9.2).
 * Callbacks enable real-time progress reporting (9.3).
 */
export async function executeSubAgents(
  plan: SubAgentPlan,
  sharedCtx?: SharedAgentContext,
  callbacks?: SubAgentCallbacks,
): Promise<SubAgentResult[]> {
  if (plan.agents.length === 0) return [];

  const ctx = sharedCtx ?? createSharedAgentContext();
  const results = new Map<string, SubAgentResult>();
  const pending = new Set(plan.agents.map((a) => a.id));

  while (pending.size > 0) {
    // Find agents whose deps are all resolved
    const ready = plan.agents.filter(
      (a) => pending.has(a.id) && a.dependsOn.every((depId) => results.has(depId))
    );

    if (ready.length === 0) {
      log.error("sub-agent deadlock: no ready agents but pending remain", {
        pending: Array.from(pending),
      });
      break;
    }

    // Enrich input context with dependency outputs + shared context messages
    for (const agent of ready) {
      // Inject dependency outputs
      for (const depId of agent.dependsOn) {
        const depResult = results.get(depId);
        if (depResult?.success) {
          agent.inputContext += `\n\n## Output from ${depResult.role} (${depId}):\n${depResult.output}`;
        }
      }

      // Inject relevant shared context messages (agent-to-agent communication)
      const relevantMessages = ctx.read(agent.role);
      if (relevantMessages.length > 0) {
        const msgBlock = relevantMessages
          .map((m) => `[${m.type.toUpperCase()} from ${m.fromRole}]: ${m.content}`)
          .join("\n");
        agent.inputContext += `\n\n## Messages from other agents:\n${msgBlock}`;
      }

      // Inject security findings for implementer if available
      if (agent.role === "implementer" && ctx.securityFindings) {
        agent.inputContext += `\n\n## Security findings to address:\n${ctx.securityFindings}`;
      }

      // Inject test findings for implementer if available
      if (agent.role === "implementer" && ctx.testFindings) {
        agent.inputContext += `\n\n## Test findings to address:\n${ctx.testFindings}`;
      }
    }

    // Notify start callbacks
    if (callbacks?.onAgentStart) {
      await Promise.allSettled(ready.map((agent) => callbacks.onAgentStart!(agent)));
    }

    // Execute ready agents in parallel
    const execPromises = ready.map((agent) => executeOneAgent(agent));
    const settled = await Promise.allSettled(execPromises);

    for (let i = 0; i < ready.length; i++) {
      const agent = ready[i];
      const outcome = settled[i];

      let result: SubAgentResult;
      if (outcome.status === "fulfilled") {
        result = outcome.value;
      } else {
        result = {
          id: agent.id,
          role: agent.role,
          model: agent.model,
          output: "",
          costUsd: 0,
          tokensUsed: 0,
          durationMs: 0,
          success: false,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        };
      }

      results.set(agent.id, result);
      pending.delete(agent.id);

      // Write findings to shared context based on role
      if (result.success && result.output) {
        if (result.role === "security") {
          ctx.securityFindings = result.output.substring(0, 2000);
          ctx.write("security", "implementer", `Security scan complete. Risk findings:\n${result.output.substring(0, 800)}`, "finding");
          ctx.write("security", "reviewer", `Security scan result:\n${result.output.substring(0, 800)}`, "finding");
        } else if (result.role === "tester") {
          ctx.testFindings = result.output.substring(0, 2000);
          ctx.write("tester", "implementer", `Test analysis complete:\n${result.output.substring(0, 600)}`, "feedback");
        } else if (result.role === "planner") {
          ctx.write("planner", "all", `Plan:\n${result.output.substring(0, 1000)}`, "context");
        } else if (result.role === "researcher") {
          ctx.write("researcher", "all", `Research findings:\n${result.output.substring(0, 800)}`, "context");
        }
      }

      // Notify complete callback (non-blocking)
      if (callbacks?.onAgentComplete) {
        const p = callbacks.onAgentComplete(result);
        if (p) p.catch(() => {/* ignore callback errors */});
      }
    }
  }

  return Array.from(results.values());
}

async function executeOneAgent(agent: SubAgent): Promise<SubAgentResult> {
  const start = Date.now();

  try {
    const response = await callAIWithFallback({
      model: agent.model,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: agent.inputContext }],
      maxTokens: agent.maxTokens,
    });

    return {
      id: agent.id,
      role: agent.role,
      model: response.modelUsed,
      output: response.content,
      costUsd: response.costEstimate.totalCost,
      tokensUsed: response.tokensUsed,
      durationMs: Date.now() - start,
      success: true,
    };
  } catch (error) {
    return {
      id: agent.id,
      role: agent.role,
      model: agent.model,
      output: "",
      costUsd: 0,
      tokensUsed: 0,
      durationMs: Date.now() - start,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- Merging ---

/**
 * Merge sub-agent results into a single enriched context string.
 */
export async function mergeResults(
  results: SubAgentResult[],
  strategy: "concatenate" | "ai_merge"
): Promise<string> {
  const successResults = results.filter((r) => r.success);

  if (successResults.length === 0) {
    return "";
  }

  if (strategy === "concatenate") {
    return successResults
      .map((r) => `## Sub-agent: ${r.role} (${r.model})\n\n${r.output}`)
      .join("\n\n---\n\n");
  }

  // ai_merge: Use Haiku to combine outputs intelligently
  const combinedInput = successResults
    .map((r) => `## ${r.role}\n${r.output}`)
    .join("\n\n---\n\n");

  try {
    const mergeResponse = await callAIWithFallback({
      model: "claude-haiku-4-5-20251001",
      system: `You are a merge agent. Combine the following sub-agent outputs into a single coherent context document.
Preserve all important information: plans, code, tests, reviews, documentation.
Remove redundancy and organize logically. Output the merged result directly.`,
      messages: [{ role: "user", content: combinedInput }],
      maxTokens: 8192,
    });

    return mergeResponse.content;
  } catch {
    // Fallback to concatenation if AI merge fails
    return successResults
      .map((r) => `## Sub-agent: ${r.role} (${r.model})\n\n${r.output}`)
      .join("\n\n---\n\n");
  }
}

// --- Cost Helpers ---

export function sumCosts(results: SubAgentResult[]): number {
  return results.reduce((sum, r) => sum + r.costUsd, 0);
}

export function sumTokens(results: SubAgentResult[]): number {
  return results.reduce((sum, r) => sum + r.tokensUsed, 0);
}

// --- Cost Estimation (for frontend preview) ---

interface SubAgentCostEstimate {
  role: SubAgentRole;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

export interface SubAgentCostPreview {
  withoutSubAgents: number;
  withSubAgents: number;
  speedupEstimate: string;
  agents: SubAgentCostEstimate[];
}

/**
 * Estimate the cost of running sub-agents for a given complexity.
 * Used by the frontend to show a cost comparison.
 */
export function estimateSubAgentCostPreview(
  complexity: number,
  budgetMode: BudgetMode = "balanced"
): SubAgentCostPreview {
  // Rough token estimates per role
  const TOKEN_ESTIMATES: Record<SubAgentRole, { input: number; output: number }> = {
    planner: { input: 4000, output: 2000 },
    implementer: { input: 8000, output: 6000 },
    tester: { input: 4000, output: 3000 },
    reviewer: { input: 6000, output: 2000 },
    documenter: { input: 4000, output: 2000 },
    researcher: { input: 4000, output: 1500 },
    security: { input: 6000, output: 2000 },
  };

  // Estimate without sub-agents (single model call)
  const baseModel = getModelForRole("implementer", budgetMode);
  const baseCost = estimateCost(12000, 8000, baseModel);

  const plan = planSubAgents("estimate", "estimate", complexity, budgetMode);
  if (plan.agents.length === 0) {
    return {
      withoutSubAgents: baseCost.totalCost,
      withSubAgents: baseCost.totalCost,
      speedupEstimate: "1x",
      agents: [],
    };
  }

  const agentEstimates: SubAgentCostEstimate[] = plan.agents.map((a) => {
    const tokens = TOKEN_ESTIMATES[a.role];
    const cost = estimateCost(tokens.input, tokens.output, a.model);
    return {
      role: a.role,
      model: a.model,
      estimatedInputTokens: tokens.input,
      estimatedOutputTokens: tokens.output,
      estimatedCostUsd: cost.totalCost,
    };
  });

  const totalSubAgentCost = agentEstimates.reduce((sum, a) => sum + a.estimatedCostUsd, 0);

  // Speedup: parallel agents reduce wall-clock time
  const parallelGroups = countParallelGroups(plan.agents);
  const speedup = plan.agents.length > 0 ? (plan.agents.length / parallelGroups).toFixed(1) : "1";

  return {
    withoutSubAgents: baseCost.totalCost,
    withSubAgents: totalSubAgentCost,
    speedupEstimate: `${speedup}x`,
    agents: agentEstimates,
  };
}

function countParallelGroups(agents: SubAgent[]): number {
  if (agents.length === 0) return 0;

  const resolved = new Set<string>();
  let groups = 0;

  const remaining = new Set(agents.map((a) => a.id));

  while (remaining.size > 0) {
    const ready = agents.filter(
      (a) => remaining.has(a.id) && a.dependsOn.every((d) => resolved.has(d))
    );
    if (ready.length === 0) break;

    for (const a of ready) {
      resolved.add(a.id);
      remaining.delete(a.id);
    }
    groups++;
  }

  return groups;
}
