"use client";

import { T } from "@/lib/tokens";
import RobotIcon from "@/components/icons/RobotIcon";

interface AgentStatusBarProps {
  sending: boolean;
  thinkSeconds: number;
  hasAgentMessages: boolean;
  agentIsDone: boolean;
}

export default function AgentStatusBar({
  sending,
  thinkSeconds,
  hasAgentMessages,
  agentIsDone,
}: AgentStatusBarProps) {
  if (!sending) return null;

  if (!hasAgentMessages) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
        <div style={{
          width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
          background: T.surface, border: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <RobotIcon size={16} />
        </div>
        <span style={{
          fontSize: 13, fontWeight: 500, fontFamily: T.mono,
          position: "relative", overflow: "hidden",
          color: T.textMuted, padding: "2px 4px",
        }}>
          TheFold tenker
          <span style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.15) 50%,transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmerMove 2s linear infinite",
            pointerEvents: "none",
          }} />
        </span>
        <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>{thinkSeconds}s</span>
      </div>
    );
  }

  if (!agentIsDone) {
    return (
      <div style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono, padding: "4px 0 4px 38px" }}>
        Oppdaterer... {thinkSeconds}s
      </div>
    );
  }

  return null;
}
