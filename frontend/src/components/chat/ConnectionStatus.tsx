"use client";

import { T } from "@/lib/tokens";

interface ConnectionStatusProps {
  status: "connected" | "connecting" | "disconnected";
}

const STATUS_MAP = {
  connected: { color: T.success, label: "Tilkoblet" },
  connecting: { color: T.warning, label: "Kobler til..." },
  disconnected: { color: T.error, label: "Frakoblet" },
};

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  const s = STATUS_MAP[status];
  return (
    <div
      title={s.label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "default",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: s.color,
          boxShadow: status === "connected" ? `0 0 6px ${s.color}60` : "none",
          transition: "background 0.3s, box-shadow 0.3s",
        }}
      />
      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
        {s.label}
      </span>
    </div>
  );
}
