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
    <div style={{ padding: "4px 0" }}>
      <div style={{
        display: "inline-flex",
        gap: 10,
        alignItems: "center",
        padding: "10px 14px",
        background: "rgba(20,20,24,0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${T.border}`,
        borderRadius: 10,
      }}>
        <MagicSpinner size={22} variant={variant} />
        <span style={{
          fontSize: 13, fontWeight: 500, fontFamily: T.mono,
          color: T.textMuted,
        }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>{thinkSeconds}s</span>
      </div>
    </div>
  );
}
