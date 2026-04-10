"use client";

import { useState, useEffect } from "react";
import { onCircuitStateChange, getCircuitState } from "@/lib/api/client";

export default function ConnectionStatus() {
  const [open, setOpen] = useState(() => getCircuitState() === "open");

  useEffect(() => {
    const unsub = onCircuitStateChange(state => {
      setOpen(state === "open");
    });
    return unsub;
  }, []);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#7C3AED",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "8px 16px",
        fontSize: 12,
        fontFamily: "monospace",
        letterSpacing: "0.03em",
      }}
    >
      {/* Pulse dot */}
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#FCA5A5",
          animation: "pulse 1.4s ease-in-out infinite",
        }}
      />
      Connection issues — retrying automatically in 30s
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
