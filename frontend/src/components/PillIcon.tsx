"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface PillIconProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  tooltip?: string;
}

export default function PillIcon({ children, active, onClick, tooltip }: PillIconProps) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={tooltip}
      style={{
        width: 28,
        height: 28,
        borderRadius: T.r,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? T.accentDim : h ? T.subtle : T.raised,
        border: `1px solid ${active ? "rgba(99,102,241,0.4)" : h ? T.borderHover : T.border}`,
        cursor: "pointer",
        transition: "all 0.15s",
        flexShrink: 0,
        color: active ? T.accent : T.textMuted,
      }}
    >
      {children}
    </div>
  );
}
