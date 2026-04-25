"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getToken } from "../lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;
const STALL_TIMEOUT_MS = 60_000; // 60 s without events → stalled

export interface StreamMessage {
  id: string;
  role: "assistant";
  content: string;
  model?: string;
  /** Signals a fully-finalised message (from chat.message_update) vs a
   *  streaming delta. Allows MessageList to dedupe + merge in-place. */
  completed?: boolean;
  costUsd?: number;
  tokens?: { inputTokens: number; outputTokens: number; totalTokens: number };
  activeSkills?: Array<{ id: string; name: string; description?: string }>;
  toolsUsed?: string[];
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: unknown;
  durationMs?: number;
  isError?: boolean;
  status: "running" | "done" | "error";
}

export interface ActiveSkill {
  id: string;
  name: string;
  description?: string;
}

interface AgentStreamState {
  messages: StreamMessage[];
  toolCalls: ToolCall[];
  status: string;
  isStreaming: boolean;
  error: string | null;
  thinkingText: string | null;
  agentStartedTaskId: string | null;
  stalled: boolean; // true when no SSE event received for STALL_TIMEOUT_MS
  activeSkills: ActiveSkill[]; // populated by agent.skills_active event at task-start
  /** Runde 2d — populated when a master-task enters sleep-mode.
   *  Cleared on `agent.resumed` or fresh stream. */
  sleeping: null | { taskId: string; pendingSubTaskId: string; userMessage: string };
  /** Runde 3-A — populated while the master-iterator is awaiting plan
   *  confirmation. UI renders <PlanPreview> with countdown + buttons.
   *  Cleared on confirm/cancel. */
  planPending: null | {
    masterTaskId: string;
    subtasks: Array<{
      id: string;
      title: string;
      phase: string | null;
      description?: string | null;
      targetFiles?: string[];
      dependsOn?: string[];
    }>;
    countdownSec: number;
    iteration: number;
    /** Wall-clock ms when the countdown was (re)set — UI uses this with
     *  countdownSec to compute live remaining seconds. */
    receivedAt: number;
  };
  /** Runde 3-B — set when agent.interrupted event arrives. */
  interrupted: null | {
    masterTaskId: string;
    pausedSubTaskId?: string;
    userMessage: string;
  };
}

export interface AgentDoneInfo {
  reason?: "natural" | "user_cancelled" | "tool_failure" | "max_loops" | "truncated";
  userMessage?: string;
  finalText?: string;
  filesWritten?: number;
}

interface UseAgentStreamOptions {
  onDone?: (info?: AgentDoneInfo) => void | Promise<void>;
  onError?: (error: string) => void;
  /** Fires on every chat.message_update SSE event. Useful for refreshing
   *  sidebar conversation lists when a brand-new conv's first exchange
   *  finalises — the conv might not have been visible at send-time but is
   *  guaranteed committed by the time we receive this. */
  onMessageUpdate?: () => void;
}

const INITIAL_STATE: AgentStreamState = {
  messages: [],
  toolCalls: [],
  status: "idle",
  isStreaming: false,
  error: null,
  thinkingText: null,
  agentStartedTaskId: null,
  stalled: false,
  activeSkills: [],
  sleeping: null,
  planPending: null,
  interrupted: null,
};

export function useAgentStream(
  taskId: string | null,
  options?: UseAgentStreamOptions
) {
  const [state, setState] = useState<AgentStreamState>(INITIAL_STATE);

  // Use refs for things that shouldn't trigger re-connects
  const esRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const resetStallTimer = useCallback(() => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    setState((prev) => (prev.stalled ? { ...prev, stalled: false } : prev));
    stallTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, stalled: true }));
    }, STALL_TIMEOUT_MS);
  }, []);

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (tid: string) => {
      cleanup();

      const token = getToken();
      const params = new URLSearchParams({ taskId: tid });
      if (token) params.set("token", token);
      const url = `${API_BASE}/agent/stream?${params.toString()}`;

      const es = new EventSource(url);
      esRef.current = es;

      setState((prev) => ({ ...prev, isStreaming: true, error: null, stalled: false }));
      resetStallTimer();

      // New streamed assistant message chunk.
      // Wire format: { timestamp, data: { role, content, delta, model } }
      es.addEventListener("agent.message", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          // Unwrap the { timestamp, data } envelope; fall back to flat for legacy
          const data = raw.data ?? raw;
          setState((prev) => ({
            ...prev,
            thinkingText: null,
            messages: [
              ...prev.messages,
              {
                // data.messageId (DB placeholder UUID) takes priority — enables dedup when
                // refreshMsgs() fetches the same message from DB after agent.done fires.
                // Falls back to SSE id: field, then a random UUID for true streaming deltas.
                id: (data.messageId as string) || e.lastEventId || crypto.randomUUID(),
                role: "assistant",
                // During streaming, content="" and delta has the chunk
                content: data.content || data.delta || "",
                model: data.model,
              },
            ],
          }));
          retryCountRef.current = 0;
        } catch {
          // malformed event — ignore
        }
      });

      // Agent called a tool.
      // Wire format: { timestamp, data: { toolName, toolUseId, input, loopIteration } }
      es.addEventListener("agent.tool_use", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const data = raw.data ?? raw;
          const toolCall: ToolCall = {
            // toolUseId is the Anthropic block ID used to correlate with tool_result
            id: data.toolUseId ?? crypto.randomUUID(),
            toolName: data.toolName ?? "unknown",
            input: data.input ?? {},
            status: "running",
          };
          setState((prev) => ({
            ...prev,
            toolCalls: [...prev.toolCalls, toolCall],
          }));
        } catch {
          // ignore
        }
      });

      // Tool execution completed.
      // Wire format: { timestamp, data: { toolUseId, toolName, content, isError, durationMs } }
      es.addEventListener("agent.tool_result", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const data = raw.data ?? raw;
          // Match by toolUseId (same Anthropic block ID set in tool_use)
          const toolUseId = data.toolUseId;
          const isError = data.isError ?? false;
          setState((prev) => ({
            ...prev,
            toolCalls: prev.toolCalls.map((tc) =>
              tc.id === toolUseId
                ? {
                    ...tc,
                    // content field holds the serialised tool result
                    result: data.content,
                    durationMs: data.durationMs,
                    isError,
                    status: isError ? "error" : "done",
                  }
                : tc
            ),
          }));
        } catch {
          // ignore
        }
      });

      // Per-tool error emitted when a tool throws OR returns { success: false }.
      // Wire format: { timestamp, data: { toolName, toolCallId, error, phase, recoverable } }
      // The matching agent.tool_result also arrives with isError: true — this
      // event just gives the UI an earlier / more descriptive error string.
      es.addEventListener("agent.tool_error", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const data = raw.data ?? raw;
          const toolCallId = data.toolCallId;
          const errorMsg = typeof data.error === "string" ? data.error : "Tool failed";
          setState((prev) => ({
            ...prev,
            toolCalls: prev.toolCalls.map((tc) =>
              tc.id === toolCallId
                ? {
                    ...tc,
                    isError: true,
                    status: "error",
                    result: tc.result ?? JSON.stringify({ error: errorMsg }),
                  }
                : tc
            ),
          }));
        } catch {
          // ignore
        }
      });

      // Chat placeholder finalised — full response content + metadata. Used
      // by MessageList to replace a "Tenker..."-placeholder bubble in-place
      // without waiting for a DB re-fetch. Deduped by messageId: if the
      // same ID already exists in state we update-in-place; otherwise we
      // append. This is the canonical chat-flow completion signal now.
      es.addEventListener("chat.message_update", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const data = raw.data ?? raw;
          if (!data.messageId) return;
          setState((prev) => {
            const id = data.messageId as string;
            const existing = prev.messages.findIndex((m) => m.id === id);
            const incoming: StreamMessage = {
              id,
              role: "assistant",
              content: data.content ?? "",
              model: data.model,
              completed: true,
              costUsd: typeof data.costUsd === "number" ? data.costUsd : undefined,
              tokens: data.tokens,
              activeSkills: Array.isArray(data.activeSkills) ? data.activeSkills : undefined,
              toolsUsed: Array.isArray(data.toolsUsed) ? data.toolsUsed : undefined,
            };
            const next = [...prev.messages];
            if (existing >= 0) {
              next[existing] = { ...next[existing], ...incoming };
            } else {
              next.push(incoming);
            }
            return { ...prev, messages: next, thinkingText: null };
          });
          retryCountRef.current = 0;
          // Fire the user-supplied update hook after state is queued. Used
          // by the sidebar to refresh conversation lists — by this point
          // the backend has definitely committed the conv row.
          try { optionsRef.current?.onMessageUpdate?.(); } catch { /* non-critical */ }
        } catch {
          // malformed event — ignore
        }
      });

      // Active-skills announcement — emitted once at task-start by the agent
      // after buildSystemPromptWithPipeline resolves the skill set. Drives
      // the "Aktive skills:" badge row in AgentStream.
      es.addEventListener("agent.skills_active", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const payload = raw.data ?? raw;
          const skills = Array.isArray(payload.skills) ? payload.skills : [];
          setState((prev) => ({
            ...prev,
            activeSkills: skills.map((s: { id: string; name: string; description?: string }) => ({
              id: s.id,
              name: s.name,
              description: s.description,
            })),
          }));
        } catch {
          // ignore
        }
      });

      // Runde 2d — Sleep-mode events.
      // agent.sleeping: master-task entered needs_input. UI shows a "venter
      // på input"-bubble so user knows the next message resumes the task.
      es.addEventListener("agent.sleeping", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const payload = raw.data ?? raw;
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            status: "sleeping",
            sleeping: {
              taskId: payload.taskId ?? "",
              pendingSubTaskId: payload.pendingSubTaskId ?? "",
              userMessage: payload.userMessage ?? "Agenten venter på at du svarer.",
            },
          }));
        } catch {
          // ignore
        }
      });

      // agent.resumed: user replied, master picked up again. Clear sleeping
      // state so UI switches back to the working avatar.
      es.addEventListener("agent.resumed", (e: MessageEvent) => {
        resetStallTimer();
        try {
          JSON.parse(e.data); // validation; payload not persisted
          setState((prev) => ({
            ...prev,
            isStreaming: true,
            status: "working",
            sleeping: null,
            interrupted: null,
          }));
        } catch {
          // ignore
        }
      });

      // Runde 3-A — Plan-preview ready. Master-iterator paused, waiting
      // for confirmation. UI renders <PlanPreview>.
      es.addEventListener("agent.plan_ready", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const payload = raw.data ?? raw;
          setState((prev) => ({
            ...prev,
            status: "plan_ready",
            isStreaming: false,
            planPending: {
              masterTaskId: String(payload.masterTaskId ?? ""),
              subtasks: Array.isArray(payload.subtasks) ? payload.subtasks : [],
              countdownSec: typeof payload.countdownSec === "number" ? payload.countdownSec : 5,
              iteration: typeof payload.iteration === "number" ? payload.iteration : 1,
              receivedAt: Date.now(),
            },
          }));
        } catch {
          // ignore
        }
      });

      // Runde 3-B — Interrupt landed. Iterator stopped between sub-tasks.
      es.addEventListener("agent.interrupted", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const payload = raw.data ?? raw;
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            status: "interrupted",
            interrupted: {
              masterTaskId: String(payload.masterTaskId ?? ""),
              pausedSubTaskId: payload.pausedSubTaskId,
              userMessage: String(payload.userMessage ?? ""),
            },
          }));
        } catch {
          // ignore
        }
      });

      // Phase / status update.
      // Wire format: { timestamp, data: { status, phase, message, loop } }
      es.addEventListener("agent.status", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          // Support both nested { timestamp, data: { status, phase } } and flat
          const payload = raw.data ?? raw;
          setState((prev) => ({
            ...prev,
            status: payload.status ?? payload.phase ?? prev.status,
            // Capture taskId when AI tool-use starts an agent task
            agentStartedTaskId:
              payload.status === "agent_started" && payload.phase
                ? (payload.phase as string)
                : prev.agentStartedTaskId,
          }));
        } catch {
          // ignore
        }
      });

      // Extended thinking text.
      // Wire format: { timestamp, data: { thought } }
      es.addEventListener("agent.thinking", (e: MessageEvent) => {
        resetStallTimer();
        try {
          const raw = JSON.parse(e.data);
          const data = raw.data ?? raw;
          // New field is "thought"; fall back to "text" for legacy compatibility
          setState((prev) => ({
            ...prev,
            thinkingText: data.thought ?? data.text ?? "Thinking...",
          }));
        } catch {
          // ignore
        }
      });

      // Stream-level error reported by server.
      // Wire format: { timestamp, data: { message, code?, recoverable? } }
      es.addEventListener("agent.error", (e: MessageEvent) => {
        try {
          const raw = JSON.parse(e.data);
          const data = raw.data ?? raw;
          // New field is "message"; fall back to "error" for legacy compatibility
          const errMsg = data.message ?? data.error ?? "Stream error";
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            error: errMsg,
            thinkingText: null,
          }));
          optionsRef.current?.onError?.(errMsg);
        } catch {
          // ignore
        }
        cleanup();
      });

      // Clean task completion
      es.addEventListener("agent.done", (evt) => {
        let info: AgentDoneInfo | undefined;
        try {
          const data = JSON.parse((evt as MessageEvent).data);
          info = {
            reason: data?.reason,
            userMessage: data?.userMessage,
            finalText: data?.finalText,
            filesWritten: data?.filesWritten,
          };
        } catch {
          // ignore — emit without info
        }
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          thinkingText: null,
          status: "done",
        }));
        const maybePromise = optionsRef.current?.onDone?.(info);
        if (maybePromise instanceof Promise) {
          maybePromise.catch(() => {});
        }
        cleanup();
      });

      // Network / connection error → exponential backoff retry
      es.onerror = () => {
        // If taskId changed while connecting, abandon this stream
        if (activeTaskIdRef.current !== tid) return;

        cleanup();

        if (retryCountRef.current >= MAX_RETRIES) {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            error: "Connection lost after multiple retries",
          }));
          return;
        }

        const delay = BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current);
        retryCountRef.current += 1;

        setState((prev) => ({ ...prev, isStreaming: false }));

        retryTimerRef.current = setTimeout(() => {
          if (activeTaskIdRef.current === tid) {
            connect(tid);
          }
        }, delay);
      };
    },
    [cleanup, resetStallTimer]
  );

  useEffect(() => {
    activeTaskIdRef.current = taskId;

    if (!taskId) {
      cleanup();
      setState(INITIAL_STATE);
      return;
    }

    retryCountRef.current = 0;
    setState(INITIAL_STATE);
    connect(taskId);

    return cleanup;
  }, [taskId, connect, cleanup]);

  return {
    messages: state.messages,
    toolCalls: state.toolCalls,
    status: state.status,
    isStreaming: state.isStreaming,
    error: state.error,
    thinkingText: state.thinkingText,
    agentStartedTaskId: state.agentStartedTaskId,
    stalled: state.stalled,
    activeSkills: state.activeSkills,
    sleeping: state.sleeping,
    planPending: state.planPending,
    interrupted: state.interrupted,
    /** Manually clear plan-preview state — called from confirm/cancel
     *  click-handlers so UI hides the preview the moment the user acts. */
    clearPlanPending: () =>
      setState((prev) => ({ ...prev, planPending: null, status: "working" })),
    clearInterrupted: () =>
      setState((prev) => ({ ...prev, interrupted: null })),
  };
}
