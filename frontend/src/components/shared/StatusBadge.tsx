"use client";

import { T } from "@/lib/tokens";

type StatusVariant = "done" | "active" | "pending" | "error" | "warning" | "info";

const VARIANT_STYLES: Record<StatusVariant, { color: string; bg: string; border: string }> = {
  done: { color: T.success, bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
  active: { color: T.accent, bg: T.accentDim, border: "rgba(99,102,241,0.3)" },
  pending: { color: T.textMuted, bg: T.subtle, border: T.border },
  error: { color: T.error, bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" },
  warning: { color: T.warning, bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.25)" },
  info: { color: "#A5B4FC", bg: "rgba(165,180,252,0.1)", border: "rgba(165,180,252,0.25)" },
};

interface StatusBadgeProps {
  variant?: StatusVariant;
  children: React.ReactNode;
}

export default function StatusBadge({ variant = "pending", children }: StatusBadgeProps) {
  const s = VARIANT_STYLES[variant];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontFamily: T.mono,
      fontWeight: 500,
      color: s.color,
      background: s.bg,
      border: `1px solid ${s.border}`,
    }}>
      {children}
    </span>
  );
}
