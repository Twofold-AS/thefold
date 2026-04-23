"use client";

// --- TypingIndicator (U10) ---
// While the assistant is generating, we show ONLY the dot-field AgentAvatar
// plus a single status line — no bubble. The bubble appears once the
// assistant has actually produced content.

import { T } from "@/lib/tokens";
import AgentAvatar from "@/components/AgentAvatar";

interface TypingIndicatorProps {
  statusText?: string | null;
  /** Retained for API back-compat — no longer influences rendering. */
  variant?: "wand" | "broom";
}

export default function TypingIndicator({ statusText }: TypingIndicatorProps) {
  return (
    <div
      style={{
        padding: "4px 0",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <AgentAvatar size={28} state="working" />
      <span
        style={{
          fontSize: 14,
          fontFamily: T.sans,
          fontWeight: 500,
          letterSpacing: "0.01em",
          color: "transparent",
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.3) 100%)",
          backgroundSize: "200% 100%",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          animation: "tf-shimmer 2.5s linear infinite",
        }}
      >
        {statusText || "Tenker..."}
      </span>
    </div>
  );
}
