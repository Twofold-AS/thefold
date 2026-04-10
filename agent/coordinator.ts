// --- AgentCoordinator ---
// Manages spawning, tracking, and cleanup of sub-agents.
// Sub-agents get scoped tool sets and emit events via agentEventBus with
// prefixed task IDs ("parentTaskId:sub:N").
//
// Feature flag: MultiAgentEnabled secret ("true" | "false")

import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import type { AgentToolName } from "./agent-tools";
import { SubAgent, type SubAgentResult } from "./sub-agent";

const MultiAgentEnabled = secret("MultiAgentEnabled"); // "true" | "false"

export function isMultiAgentEnabled(): boolean {
  try {
    return MultiAgentEnabled() === "true";
  } catch {
    return false;
  }
}

export interface SpawnOptions {
  /** Description of the sub-task for this agent */
  description: string;
  /** Which tools this sub-agent is allowed to call */
  toolSubset: AgentToolName[];
}

export class AgentCoordinator {
  private subAgents = new Map<string, SubAgent>();
  private counter = 0;

  constructor(private parentTaskId: string) {}

  /**
   * Spawn a new sub-agent for the given sub-task.
   * Returns the sub-task ID that can be passed to waitForAll / cancelAll.
   */
  spawnSubAgent(opts: SpawnOptions): SubAgent {
    if (!isMultiAgentEnabled()) {
      throw new Error("MultiAgentEnabled feature flag is not set — sub-agents are disabled");
    }

    const index = this.counter++;
    const agent = new SubAgent({
      parentTaskId: this.parentTaskId,
      index,
      description: opts.description,
      toolSubset: opts.toolSubset,
    });

    this.subAgents.set(agent.taskId, agent);

    log.info("Sub-agent spawned", {
      parentTaskId: this.parentTaskId,
      subTaskId: agent.taskId,
      tools: opts.toolSubset,
    });

    agent.emitStatus("spawned", `Starting: ${opts.description}`);

    return agent;
  }

  /**
   * Wait for all specified sub-agents to complete.
   * Returns their results in the same order as the input IDs.
   */
  async waitForAll(subTaskIds: string[]): Promise<SubAgentResult[]> {
    const agents = subTaskIds.map(id => {
      const agent = this.subAgents.get(id);
      if (!agent) {
        return Promise.resolve<SubAgentResult>({
          subTaskId: id,
          success: false,
          error: `Sub-agent ${id} not found`,
        });
      }
      return agent.completion;
    });

    const results = await Promise.allSettled(agents);

    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        subTaskId: subTaskIds[i],
        success: false,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });
  }

  /**
   * Abort all specified sub-agents.
   */
  cancelAll(subTaskIds: string[]): void {
    for (const id of subTaskIds) {
      const agent = this.subAgents.get(id);
      if (!agent) continue;
      agent.abort();
      log.info("Sub-agent cancelled", { subTaskId: id, parentTaskId: this.parentTaskId });
    }
  }

  /**
   * Abort all sub-agents managed by this coordinator.
   */
  cancelAllPending(): void {
    for (const [id, agent] of this.subAgents) {
      if (!agent.isAborted()) {
        agent.abort();
        log.info("Sub-agent cancelled (cleanup)", { subTaskId: id });
      }
    }
  }

  /** IDs of all spawned sub-agents */
  get allSubTaskIds(): string[] {
    return [...this.subAgents.keys()];
  }

  /** Get a sub-agent by its taskId */
  getSubAgent(subTaskId: string): SubAgent | undefined {
    return this.subAgents.get(subTaskId);
  }
}
