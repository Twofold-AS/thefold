// --- Swarm aggregator (Fase H, Commit 40 + 41) ---
// Per sub-agent events flow through agentEventBus. The aggregator keeps an
// in-memory Map<parentTaskId, SwarmState> and produces a single upserted
// swarm_status chat message via chat.upsertSwarmMessage.
//
// Per-agent events are preserved (debug modes + detail-modal history); the
// aggregator only deduplicates at the chat-message level so the UI sees ONE
// living message instead of N fragmented ones.
//
// Throttling: the aggregator collapses rapid updates to at most one DB write
// per second per parentTaskId (§41 krav). Unsent state is flushed on
// subagent.completed so the final snapshot always wins.

import log from "encore.dev/log";
import { agentEventBus } from "./event-bus";
import type {
  AgentEvent,
  SubAgentStartedData,
  SubAgentProgressData,
  SubAgentStatusChangeData,
  SubAgentCompletedData,
} from "./events";

const WRITE_THROTTLE_MS = 1000;

export type SwarmAgentStatus = "waiting" | "running" | "completed" | "failed";

export interface SwarmAgentState {
  id: string;
  num: number;
  role: string;
  status: SwarmAgentStatus;
  activity: string;
  startedAt?: string;
  completedAt?: string;
}

interface SwarmState {
  parentTaskId: string;
  /** Stable chat-message ID used for upsert */
  messageId: string | null;
  /** In-order insertion keeps num/role stable */
  agents: Map<string, SwarmAgentState>;
  /** Last write + pending timer */
  lastWriteMs: number;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  /** Unsubscribe callback for teardown */
  unsubscribe: (() => void) | null;
  /** Conversation used by chat.upsertSwarmMessage */
  conversationId: string;
}

const active = new Map<string, SwarmState>();

function buildContent(state: SwarmState): string {
  const agents = [...state.agents.values()].sort((a, b) => a.num - b.num);
  const activeCount = agents.filter((a) => a.status === "running" || a.status === "waiting").length;
  return JSON.stringify({
    type: "swarm_status",
    parentTaskId: state.parentTaskId,
    active: activeCount,
    agents: agents.map((a) => ({
      id: a.id,
      num: a.num,
      role: a.role,
      status: a.status,
      activity: a.activity,
    })),
  });
}

async function flush(state: SwarmState): Promise<void> {
  if (state.agents.size === 0) return;
  const content = buildContent(state);
  try {
    const clients = await import("~encore/clients");
    // Cast via unknown — chat.upsertSwarmMessage is new; encore.gen regenerates
    // on `encore run`. Safe fallback: log and continue if client missing.
    const chat = (
      clients as unknown as {
        chat?: {
          upsertSwarmMessage: (req: {
            parentTaskId: string;
            conversationId: string;
            content: string;
            messageId?: string;
          }) => Promise<{ messageId: string }>;
        };
      }
    ).chat;
    if (!chat?.upsertSwarmMessage) {
      log.warn("swarm-aggregator: chat.upsertSwarmMessage not available — skipping flush");
      return;
    }
    const res = await chat.upsertSwarmMessage({
      parentTaskId: state.parentTaskId,
      conversationId: state.conversationId,
      content,
      messageId: state.messageId ?? undefined,
    });
    state.messageId = res.messageId;
    state.lastWriteMs = Date.now();
  } catch (err) {
    log.warn("swarm-aggregator: flush failed", {
      parentTaskId: state.parentTaskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function scheduleFlush(state: SwarmState, immediate = false): void {
  if (state.pendingTimer) clearTimeout(state.pendingTimer);
  const sinceLast = Date.now() - state.lastWriteMs;
  const delay = immediate ? 0 : Math.max(0, WRITE_THROTTLE_MS - sinceLast);
  state.pendingTimer = setTimeout(() => {
    state.pendingTimer = null;
    void flush(state);
  }, delay);
}

function handleEvent(state: SwarmState, event: AgentEvent): void {
  switch (event.type) {
    case "subagent.started": {
      const d = event.data as SubAgentStartedData;
      state.agents.set(d.agentId, {
        id: d.agentId,
        num: d.num,
        role: d.role,
        status: "waiting",
        activity: "Venter på tur...",
        startedAt: d.startedAt,
      });
      scheduleFlush(state);
      return;
    }
    case "subagent.status_change": {
      const d = event.data as SubAgentStatusChangeData;
      const cur = state.agents.get(d.agentId);
      if (!cur) return;
      cur.status = d.status;
      if (d.status === "running" && cur.activity === "Venter på tur...") {
        cur.activity = `${d.role} starter...`;
      }
      scheduleFlush(state);
      return;
    }
    case "subagent.progress": {
      const d = event.data as SubAgentProgressData;
      const cur = state.agents.get(d.agentId);
      if (!cur) return;
      cur.activity = d.activity;
      scheduleFlush(state);
      return;
    }
    case "subagent.completed": {
      const d = event.data as SubAgentCompletedData;
      const cur = state.agents.get(d.agentId);
      if (!cur) return;
      cur.status = d.success ? "completed" : "failed";
      cur.completedAt = d.completedAt;
      cur.activity = d.success ? "Ferdig" : "Feilet";
      // Final snapshot — flush immediately so the UI doesn't miss the end state.
      scheduleFlush(state, true);
      return;
    }
    default:
      return;
  }
}

/**
 * Start aggregating for a parent task. Safe to call multiple times — the
 * second call is a no-op. Must be paired with `stopSwarmAggregator()` after
 * all sub-agents complete.
 */
export function startSwarmAggregator(
  parentTaskId: string,
  conversationId: string,
): void {
  if (active.has(parentTaskId)) return;
  const state: SwarmState = {
    parentTaskId,
    conversationId,
    messageId: null,
    agents: new Map(),
    lastWriteMs: 0,
    pendingTimer: null,
    unsubscribe: null,
  };
  state.unsubscribe = agentEventBus.subscribe(parentTaskId, (event) => {
    handleEvent(state, event);
  });
  active.set(parentTaskId, state);
  log.info("swarm-aggregator: started", { parentTaskId });
}

/** Stop the aggregator after all sub-agents have finished. Flushes any pending. */
export async function stopSwarmAggregator(parentTaskId: string): Promise<void> {
  const state = active.get(parentTaskId);
  if (!state) return;
  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
    state.pendingTimer = null;
  }
  await flush(state);
  state.unsubscribe?.();
  active.delete(parentTaskId);
  log.info("swarm-aggregator: stopped", { parentTaskId });
}
