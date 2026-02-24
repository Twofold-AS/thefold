"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

interface ThinkingIndicatorProps {
  agentName?: string;
}

export function ThinkingIndicator({ agentName = "TheFold" }: ThinkingIndicatorProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 animate-message-enter">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          background: "var(--tf-surface-raised)",
          border: "1px solid var(--tf-border-faint)",
        }}
      >
        <Bot className="w-3.5 h-3.5" style={{ color: "var(--tf-text-secondary)" }} />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--tf-heat)",
              animation: "progress-dot 1.4s infinite ease-in-out",
              animationDelay: "0s",
            }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--tf-heat)",
              animation: "progress-dot 1.4s infinite ease-in-out",
              animationDelay: "0.2s",
            }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--tf-heat)",
              animation: "progress-dot 1.4s infinite ease-in-out",
              animationDelay: "0.4s",
            }}
          />
        </div>
        <span className="text-xs" style={{ color: "var(--tf-text-faint)" }}>
          {agentName} is thinking
          {seconds > 0 && <span className="tabular-nums"> &middot; {seconds}s</span>}
        </span>
      </div>
    </div>
  );
}
