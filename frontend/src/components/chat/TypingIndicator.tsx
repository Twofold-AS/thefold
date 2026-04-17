"use client";

import { T } from "@/lib/tokens";
import MagicSpinner from "@/components/MagicSpinner";

interface TypingIndicatorProps {
  statusText?: string | null;
  /** "wand" for CoWork, "broom" for Auto */
  variant?: "wand" | "broom";
}

/**
 * Loading indicator shown while the assistant is generating a response.
 * Uses MagicSpinner (orbiting wand/broom with sparkles).
 */
export default function TypingIndicator({ statusText, variant = "wand" }: TypingIndicatorProps) {
  return (
    <div style={{ padding: "4px 0", animation: "fadeIn 0.15s ease-out" }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
          fontSize: 13,
          fontWeight: 500,
          fontFamily: T.mono,
          color: T.textMuted,
        }}>
          {statusText || "Tenker..."}
        </span>
      </div>
    </div>
  );
}
