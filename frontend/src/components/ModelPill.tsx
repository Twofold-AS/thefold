"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface ModelPillProps {
  model?: string;
}

export default function ModelPill({ model = "Sonnet 4.6" }: ModelPillProps) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        borderRadius: T.r,
        padding: "0 10px 0 0",
        background: h ? T.subtle : T.raised,
        border: `1px solid ${h ? T.borderHover : T.border}`,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: T.r,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: T.textSec }}>A</span>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: T.textSec,
          fontFamily: T.sans,
          whiteSpace: "nowrap",
        }}
      >
        {model}
      </span>
    </div>
  );
}
