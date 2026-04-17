"use client";

import { T } from "@/lib/tokens";

interface ModeIndicatorProps {
  icon: string;
  color: string;
  label: string;
  onDismiss?: () => void;
}

export default function ModeIndicator({ icon, color, label, onDismiss }: ModeIndicatorProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 16px",
      background: `${color}12`,
      border: `1px solid ${color}40`,
      borderRadius: 12,
      marginBottom: 8,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color, lineHeight: 1 }}>
        {icon}
      </span>
      <span style={{ fontSize: 13, color, fontFamily: T.sans, flex: 1 }}>
        {label}
      </span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: color,
            padding: 4,
            display: "flex",
            alignItems: "center",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            close
          </span>
        </button>
      )}
    </div>
  );
}
