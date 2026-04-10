"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export interface StreamMessage {
  id: string;
  role: "assistant";
  content: string;
  model?: string;
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

interface AgentStreamState {
  messages: StreamMessage[];
  toolCalls: ToolCall[];
  status: string;
  isStreaming: boolean;
  error: string | null;
  thinkingText: string | null;
}

interface UseAgentStreamOptions {
  onDone?: () => void;
  onError?: (error: string) => void;
}

const INITIAL_STATE: AgentStreamState = {
  messages: [],
  toolCalls: [],
  status: "idle",
  isStreaming: false,
  error: null,
  thinkingText: null,
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
  const activeTaskIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
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

      setState((prev) => ({ ...prev, isStreaming: true, error: null }));

      // New streamed assistant message chunk
      es.addEventListener("agent.message", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            thinkingText: null,
            messages: [
              ...prev.messages,
              {
                id: data.id ?? crypto.randomUUID(),
                role: "assistant",
                content: data.content ?? "",
                model: data.model,
              },
            ],
          }));
          retryCountRef.current = 0;
        } catch {
          // malformed event — ignore
        }
      });

      // Agent called a tool
      es.addEventListener("agent.tool_use", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const toolCall: ToolCall = {
            id: data.id ?? crypto.randomUUID(),
            toolName: data.tool_name ?? data.toolName ?? "unknown",
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

      // Tool execution completed
      es.addEventListener("agent.tool_result", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const isError = data.is_error ?? data.isError ?? false;
          setState((prev) => ({
            ...prev,
            toolCalls: prev.toolCalls.map((tc) =>
              tc.id === data.id
                ? {
                    ...tc,
                    result: data.result,
                    durationMs: data.duration_ms ?? data.durationMs,
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

      // Phase / status update
      es.addEventListener("agent.status", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            status: data.status ?? data.phase ?? prev.status,
          }));
        } catch {
          // ignore
        }
      });

      // Extended thinking text
      es.addEventListener("agent.thinking", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setState((prev) => ({
            ...prev,
            thinkingText: data.text ?? "Thinking...",
          }));
        } catch {
          // ignore
        }
      });

      // Stream-level error reported by server
      es.addEventListener("agent.error", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const errMsg = data.error ?? data.message ?? "Stream error";
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
      es.addEventListener("agent.done", () => {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          thinkingText: null,
          status: "done",
        }));
        optionsRef.current?.onDone?.();
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
    [cleanup]
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
  };
}
