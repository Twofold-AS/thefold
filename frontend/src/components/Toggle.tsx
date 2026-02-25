"use client";

import { T } from "@/lib/tokens";

interface ToggleProps {
  checked?: boolean;
  onChange?: (val: boolean) => void;
  label?: string;
}

export default function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div
        onClick={() => onChange && onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? T.accent : T.subtle,
          border: `1px solid ${checked ? T.accent : T.border}`,
          position: "relative",
          transition: "all 0.2s",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: checked ? "#fff" : T.textMuted,
            position: "absolute",
            top: 2,
            left: checked ? 19 : 2,
            transition: "left 0.2s",
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: 13, color: T.textSec, fontFamily: T.sans }}>{label}</span>
      )}
    </label>
  );
}
