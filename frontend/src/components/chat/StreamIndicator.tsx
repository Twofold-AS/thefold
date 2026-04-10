"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";

interface StreamIndicatorProps {
  isThinking?: boolean;
  thinkingText?: string | null;
  /** Name of the currently executing tool, or null if no tool is running */
  activeTool?: string | null;
  /** 0–100 progress value. If provided and > 0, shows a progress bar. */
  progress?: number | null;
}

/**
 * Displays the current agent activity as a compact status row:
 * - Extended thinking  → pulsing purple dot + thinking text
 * - Tool execution     → rotating gear icon + tool name
 * - Progress           → thin animated progress bar
 * Falls back to null when nothing is active.
 */
export function StreamIndicator({
  isThinking = false,
  thinkingText,
  activeTool,
  progress,
}: StreamIndicatorProps) {
  const [seconds, setSeconds] = useState(0);

  // Elapsed-seconds counter while thinking or a tool is running
  const isActive = isThinking || !!activeTool;
  useEffect(() => {
    if (!isActive) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const iv = setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      1000
    );
    return () => clearInterval(iv);
  }, [isActive]);

  const hasProgress =
    typeof progress === "number" && progress > 0 && progress < 100;

  if (!isThinking && !activeTool && !hasProgress) return null;

  return (
    <div className="flex flex-col gap-1.5 animate-message-enter">
      {/* Thinking row */}
      {isThinking && (
        <div className="flex items-center gap-2.5">
          {/* Pulsing dot */}
          <span
            className="relative flex h-2 w-2 flex-shrink-0"
            style={{ color: "var(--tf-heat)" }}
          >
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{
                background: "var(--tf-heat)",
                animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: "var(--tf-heat)" }}
            />
          </span>

          <span
            className="text-xs font-medium"
            style={{ color: "var(--tf-text-secondary)" }}
          >
            {thinkingText ?? "Thinking"}
            {seconds > 0 && (
              <span
                className="tabular-nums ml-1"
                style={{ color: "var(--tf-text-faint)" }}
              >
                &middot; {seconds}s
              </span>
            )}
          </span>
        </div>
      )}

      {/* Tool execution row */}
      {activeTool && (
        <div className="flex items-center gap-2">
          {/* Spinning gear */}
          <Wrench
            className="w-3 h-3 flex-shrink-0"
            style={{
              color: "var(--tf-text-faint)",
              animation: "spin 1.4s linear infinite",
            }}
          />
          <span className="text-xs" style={{ color: "var(--tf-text-faint)" }}>
            <span
              className="font-mono px-1 py-0.5 rounded text-[10px]"
              style={{
                background: "var(--tf-surface-raised)",
                color: "var(--tf-text-secondary)",
                border: "1px solid var(--tf-border-faint)",
              }}
            >
              {activeTool}
            </span>
            {!isThinking && seconds > 0 && (
              <span className="ml-2 tabular-nums">{seconds}s</span>
            )}
          </span>
        </div>
      )}

      {/* Progress bar */}
      {hasProgress && (
        <div
          className="h-0.5 w-full rounded-full overflow-hidden"
          style={{ background: "var(--tf-border-faint)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background:
                "linear-gradient(90deg, var(--tf-heat), rgba(99,102,241,0.8))",
            }}
          />
        </div>
      )}
    </div>
  );
}
