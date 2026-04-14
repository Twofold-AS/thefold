"use client";

import { T, S } from "@/lib/tokens";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down"; percent: number };
  onClick?: () => void;
  color?: "default" | "success" | "warning" | "error";
}

const colorMap = {
  default: T.accent,
  success: T.success,
  warning: T.warning,
  error: T.error,
};

export default function StatCard({ label, value, trend, onClick, color = "default" }: StatCardProps) {
  const accentColor = colorMap[color];
  return (
    <div
      onClick={onClick}
      style={{
        background: T.raised,
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        padding: S.md,
        cursor: onClick ? "pointer" : undefined,
        transition: "border-color 0.15s",
        minWidth: 0,
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.borderColor = T.borderHover)}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.borderColor = T.border)}
    >
      <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S.xs }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: S.sm }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: T.text, fontFamily: T.mono }}>
          {value}
        </span>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 600, color: trend.direction === "up" ? T.success : T.error }}>
            {trend.direction === "up" ? "\u2191" : "\u2193"} {trend.percent}%
          </span>
        )}
      </div>
    </div>
  );
}
