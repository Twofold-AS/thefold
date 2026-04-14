"use client";

import { T } from "@/lib/tokens";
import MagicSpinner from "@/components/MagicSpinner";

interface AgentStatusBarProps {
  sending: boolean;
  thinkSeconds: number;
  hasAgentMessages: boolean;
  agentIsDone: boolean;
  streamStatusText?: string | null;
  /** "wand" for CoWork, "broom" for Auto */
  variant?: "wand" | "broom";
}

/**
 * Single unified loading indicator for agent tasks.
 * Shows MagicSpinner + status text. Only visible when sending && activeTaskId.
 * Once agent messages appear in the stream (AgentStream renders them),
 * this bar hides to avoid duplicate status display.
 */
export default function AgentStatusBar({
  sending,
  thinkSeconds,
  hasAgentMessages,
  agentIsDone,
  streamStatusText,
  variant = "wand",
}: AgentStatusBarProps) {
  if (!sending || agentIsDone || hasAgentMessages) return null;

  const label = streamStatusText || "Tenker...";

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0" }}>
      <MagicSpinner size={24} variant={variant} />
      <span style={{
        fontSize: 13, fontWeight: 500, fontFamily: T.mono,
        color: T.textMuted,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>{thinkSeconds}s</span>
    </div>
  );
}
