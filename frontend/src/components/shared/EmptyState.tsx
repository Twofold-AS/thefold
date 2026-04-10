"use client";

import { T } from "@/lib/tokens";

interface EmptyStateProps {
  message: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export default function EmptyState({ message, hint, icon, action }: EmptyStateProps) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {icon && (
        <div style={{ color: T.textFaint, marginBottom: 4 }}>{icon}</div>
      )}
      <span style={{ fontSize: 13, color: T.textFaint }}>{message}</span>
      {hint && <span style={{ fontSize: 12, color: T.textFaint, opacity: 0.7 }}>{hint}</span>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
