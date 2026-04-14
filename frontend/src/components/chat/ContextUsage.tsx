"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

interface ContextUsageProps {
  messageCount: number;
  estimatedTokens: number;
  maxTokens: number;
}

function usageColor(pct: number): string {
  if (pct >= 80) return T.error;
  if (pct >= 60) return T.warning;
  return T.textMuted;
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function ContextUsage({ messageCount, estimatedTokens, maxTokens }: ContextUsageProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const pct = maxTokens > 0 ? Math.min(100, (estimatedTokens / maxTokens) * 100) : 0;
  const color = usageColor(pct);

  return (
    <div
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Compact indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 8px",
          borderRadius: 999,
          border: `1px solid ${pct >= 60 ? color : T.border}`,
          cursor: "default",
          transition: "border-color 0.2s",
        }}
      >
        {/* Mini arc */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          {/* Background circle */}
          <circle
            cx="7"
            cy="7"
            r="5"
            stroke={T.border}
            strokeWidth="2"
            fill="none"
          />
          {/* Progress arc — full circle circumference ≈ 31.4 */}
          <circle
            cx="7"
            cy="7"
            r="5"
            stroke={color}
            strokeWidth="2"
            fill="none"
            strokeDasharray={`${(pct / 100) * 31.4} 31.4`}
            strokeLinecap="round"
            transform="rotate(-90 7 7)"
            style={{ transition: "stroke-dasharray 0.3s ease, stroke 0.3s ease" }}
          />
        </svg>
        <span
          style={{
            fontSize: 10,
            fontFamily: T.mono,
            color,
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "10px 14px",
            minWidth: 200,
            zIndex: 100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: T.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            Context window
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "4px 12px",
              fontSize: 11,
              fontFamily: T.mono,
            }}
          >
            <span style={{ color: T.textSec }}>Messages</span>
            <span style={{ color: T.text }}>{messageCount}</span>
            <span style={{ color: T.textSec }}>Est. tokens</span>
            <span style={{ color: T.text }}>{formatK(estimatedTokens)}</span>
            <span style={{ color: T.textSec }}>Limit</span>
            <span style={{ color: T.text }}>{formatK(maxTokens)}</span>
            <span style={{ color: T.textSec }}>Used</span>
            <span style={{ color }}>{Math.round(pct)}%</span>
          </div>
          {/* Mini bar */}
          <div
            style={{
              marginTop: 10,
              height: 3,
              borderRadius: 2,
              background: T.border,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: color,
                borderRadius: 2,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
