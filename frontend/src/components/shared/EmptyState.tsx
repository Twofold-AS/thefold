"use client";

import { T, S } from "@/lib/tokens";
import Btn from "@/components/Btn";

interface EmptyStateProps {
  /** @deprecated Use title instead */
  message?: string;
  title?: string;
  description?: string;
  /** @deprecated Use description instead */
  hint?: string;
  icon?: React.ReactNode;
  /** New: object-form action */
  action?: { label: string; onClick: () => void } | React.ReactNode;
}

export default function EmptyState({ message, title, description, hint, icon, action }: EmptyStateProps) {
  const displayTitle = title ?? message ?? "Ingen data";
  const displayDesc = description ?? hint;

  return (
    <div style={{ padding: `${S.xxl}px ${S.lg}px`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: S.sm }}>
      {icon && (
        <div style={{ color: T.textFaint, marginBottom: S.xs }}>{icon}</div>
      )}
      <span style={{ fontSize: 14, fontWeight: 500, color: T.textMuted }}>{displayTitle}</span>
      {displayDesc && <span style={{ fontSize: 12, color: T.textFaint }}>{displayDesc}</span>}
      {action && (
        <div style={{ marginTop: S.sm }}>
          {typeof action === "object" && action !== null && "label" in action ? (
            <Btn variant="primary" size="sm" onClick={(action as { label: string; onClick: () => void }).onClick}>
              {(action as { label: string; onClick: () => void }).label}
            </Btn>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}
