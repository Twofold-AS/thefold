"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface BtnProps {
  children: React.ReactNode;
  primary?: boolean;
  sm?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function Btn({ children, primary, sm, disabled, onClick, style: sx }: BtnProps) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => { if (!disabled) setH(true); }}
      onMouseLeave={() => setH(false)}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: sm ? "5px 12px" : "8px 18px",
        fontSize: sm ? 12 : 13,
        fontFamily: T.sans,
        fontWeight: primary ? 600 : 500,
        background: disabled ? T.subtle : primary ? (h ? "#818CF8" : T.accent) : h ? T.subtle : "transparent",
        color: disabled ? T.textFaint : primary ? "#fff" : T.text,
        border: `1px solid ${primary && !disabled ? "transparent" : T.border}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s",
        outline: "none",
        borderRadius: T.r,
        ...sx,
      }}
    >
      {children}
    </button>
  );
}
