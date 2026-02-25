"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface BtnProps {
  children: React.ReactNode;
  primary?: boolean;
  sm?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function Btn({ children, primary, sm, onClick, style: sx }: BtnProps) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: sm ? "5px 12px" : "8px 18px",
        fontSize: sm ? 12 : 13,
        fontFamily: T.sans,
        fontWeight: primary ? 600 : 500,
        background: primary ? (h ? "#818CF8" : T.accent) : h ? T.subtle : "transparent",
        color: primary ? "#fff" : T.text,
        border: `1px solid ${primary ? "transparent" : T.border}`,
        cursor: "pointer",
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
