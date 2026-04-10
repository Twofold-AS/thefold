// --- SubAgent ---
// A scoped agent instance that runs a focused tool loop for a specific sub-task.
// Each sub-agent gets a prefixed taskId ("parentTaskId:sub:N") so its SSE events
// are isolated from the parent stream but observable via agentEventBus.

import log from "encore.dev/log";
import type { AgentToolName } from "./agent-tools";
import { AGENT_TOOLS } from "./agent-tools";
import { agentEventBus } from "./event-bus";
import { createAgentEvent } from "./events";

export interface SubAgentOptions {
  parentTaskId: string;
  index: number;
  description: string;
  toolSubset: AgentToolName[];
}

export interface SubAgentResult {
  subTaskId: string;
  success: boolean;
  output?: string;
  error?: string;
  filesChanged?: string[];
}

export class SubAgent {
  readonly taskId: string;
  private aborted = false;
  private resolveCompletion!: (result: SubAgentResult) => void;
  readonly completion: Promise<SubAgentResult>;

  constructor(private opts: SubAgentOptions) {
    this.taskId = `${opts.parentTaskId}:sub:${opts.index}`;
    this.completion = new Promise<SubAgentResult>((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  /** Filtered tool list for this sub-agent's scope */
  get tools() {
    return AGENT_TOOLS.filter(t => this.opts.toolSubset.includes(t.name as AgentToolName));
  }

  get description(): string {
    return this.opts.description;
  }

  /** Abort this sub-agent; resolves the completion promise with an error */
  abort(): void {
    if (this.aborted) return;
    this.aborted = true;

    agentEventBus.emit(this.taskId, createAgentEvent("agent.done", {
      finalText: "Sub-agent aborted",
      toolsUsed: [],
      filesWritten: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      costUsd: 0,
      loopsUsed: 0,
      stoppedAtMaxLoops: false,
    }));

    this.resolveCompletion({
      subTaskId: this.taskId,
      success: false,
      error: "Aborted by coordinator",
    });
  }

  isAborted(): boolean {
    return this.aborted;
  }

  /**
   * Emit a status event from this sub-agent.
   * Also mirrors progress to the parent stream so the UI can show sub-agent activity.
   */
  emitStatus(status: string, message?: string): void {
    agentEventBus.emit(this.taskId, createAgentEvent("agent.status", {
      status,
      phase: `sub-agent:${this.opts.index}`,
      message,
    }));

    agentEventBus.emit(this.opts.parentTaskId, createAgentEvent("agent.progress", {
      step: `sub-agent:${this.opts.index} — ${message ?? status}`,
    }));
  }

  /**
   * Complete this sub-agent with a result.
   * Called by AgentCoordinator after the tool loop finishes.
   */
  complete(result: Omit<SubAgentResult, "subTaskId">): void {
    if (this.aborted) return;

    log.info("Sub-agent completed", {
      subTaskId: this.taskId,
      success: result.success,
      filesChanged: result.filesChanged?.length ?? 0,
    });

    agentEventBus.emit(this.taskId, createAgentEvent("agent.done", {
      finalText: result.output ?? (result.success ? "Done" : result.error ?? "Failed"),
      toolsUsed: [],
      filesWritten: result.filesChanged?.length ?? 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      costUsd: 0,
      loopsUsed: 0,
      stoppedAtMaxLoops: false,
      filesChanged: result.filesChanged,
    }));

    this.resolveCompletion({ subTaskId: this.taskId, ...result });
  }
}
