"use client";

import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";

interface ErrorStateProps {
  message: string;
  retry?: () => void;
  dismiss?: () => void;
}

export default function ErrorState({ message, retry, dismiss }: ErrorStateProps) {
  return (
    <div
      style={{
        padding: S.lg,
        background: "rgba(239,68,68,0.06)",
        border: `1px solid rgba(239,68,68,0.2)`,
        borderRadius: T.r,
        display: "flex",
        alignItems: "center",
        gap: S.md,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="9" cy="9" r="8" stroke={T.error} strokeWidth="1.5" />
        <path d="M9 5.5v4" stroke={T.error} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="12.5" r="0.75" fill={T.error} />
      </svg>
      <span style={{ flex: 1, fontSize: 13, color: T.error }}>{message}</span>
      <div style={{ display: "flex", gap: S.sm }}>
        {retry && (
          <Btn size="sm" variant="danger" onClick={retry}>
            Prøv igjen
          </Btn>
        )}
        {dismiss && (
          <Btn size="sm" variant="ghost" onClick={dismiss}>
            Lukk
          </Btn>
        )}
      </div>
    </div>
  );
}
