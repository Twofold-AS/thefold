"use client";

import { T } from "@/lib/tokens";
import { Square } from "lucide-react";

export interface SubAgentSidebarData {
  id: string;
  role: string;
  status: "pending" | "working" | "done" | "failed";
  model?: string;
  label?: string;
}

interface SubAgentSidebarItemProps extends SubAgentSidebarData {
  collapsed?: boolean;
  onClick?: () => void;
  onStop?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: T.textFaint,
  working: T.accent,
  done: T.success,
  failed: T.error,
};

export default function SubAgentSidebarItem({
  role,
  status,
  label,
  collapsed = false,
  onClick,
  onStop,
}: SubAgentSidebarItemProps) {
  const color = STATUS_COLORS[status] ?? T.textMuted;
  const isActive = status === "working";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: collapsed ? "6px 0" : "6px 8px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s",
        fontSize: 12,
        color: T.textMuted,
        position: "relative",
      }}
    >
      {/* Status dot */}
      <div style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        boxShadow: isActive ? `0 0 6px ${color}40` : "none",
        animation: isActive ? "thinking-pulse 1.4s ease-in-out infinite" : "none",
      }} />

      {!collapsed && (
        <>
          <span style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: T.mono,
            fontSize: 11,
            color: isActive ? T.text : T.textMuted,
          }}>
            {label || role}
          </span>

          {/* Stop button on hover */}
          {isActive && onStop && (
            <button
              onClick={(e) => { e.stopPropagation(); onStop(); }}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: T.error,
                padding: 2,
                display: "flex",
                opacity: 0.6,
              }}
              title="Stopp agent"
            >
              <Square size={10} />
            </button>
          )}
        </>
      )}

      <style>{`
        @keyframes thinking-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}
