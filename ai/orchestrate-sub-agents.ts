// Sub-agent orchestration: planning, parallel execution, and result merging

import log from "encore.dev/log";
import { callAIWithFallback } from "./ai";
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

// --- Execution ---

/**
 * Execute sub-agents respecting dependency ordering.
 * Agents with no unresolved deps run in parallel via Promise.allSettled.
 * Completed agents' output is fed as inputContext to dependents.
 */
export async function executeSubAgents(plan: SubAgentPlan): Promise<SubAgentResult[]> {
  if (plan.agents.length === 0) return [];

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

    // Enrich input context with dependency outputs
    for (const agent of ready) {
      for (const depId of agent.dependsOn) {
        const depResult = results.get(depId);
        if (depResult?.success) {
          agent.inputContext += `\n\n## Output from ${depResult.role} (${depId}):\n${depResult.output}`;
        }
      }
    }

    // Execute ready agents in parallel
    const execPromises = ready.map((agent) => executeOneAgent(agent));
    const settled = await Promise.allSettled(execPromises);

    for (let i = 0; i < ready.length; i++) {
      const agent = ready[i];
      const outcome = settled[i];

      if (outcome.status === "fulfilled") {
        results.set(agent.id, outcome.value);
      } else {
        results.set(agent.id, {
          id: agent.id,
          role: agent.role,
          model: agent.model,
          output: "",
          costUsd: 0,
          tokensUsed: 0,
          durationMs: 0,
          success: false,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        });
      }
      pending.delete(agent.id);
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
