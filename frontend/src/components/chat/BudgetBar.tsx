"use client";

import { useState, useEffect, useRef } from "react";
import { T } from "@/lib/tokens";

interface BudgetBarProps {
  used: number;
  max: number;
  /** Called when user clicks Pause at 100% */
  onPause?: () => void;
}

function barColor(pct: number): string {
  if (pct >= 100) return "#EF4444"; // red-500
  if (pct >= 80) return "#F59E0B";  // amber-500
  return "#22C55E";                  // green-500
}

export default function BudgetBar({ used, max, onPause }: BudgetBarProps) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const color = barColor(pct);

  const [showWarning, setShowWarning] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);

  // Track crossings so we only fire each popup once per threshold breach
  const warnFiredRef = useRef(false);
  const pauseFiredRef = useRef(false);

  useEffect(() => {
    if (pct >= 100 && !pauseFiredRef.current) {
      pauseFiredRef.current = true;
      warnFiredRef.current = true; // also suppress warning if we hit 100
      setShowWarning(false);
      setShowPauseDialog(true);
    } else if (pct >= 80 && !warnFiredRef.current) {
      warnFiredRef.current = true;
      setShowWarning(true);
    }
    // Reset refs when usage drops back below threshold (e.g. new conversation)
    if (pct < 80) {
      warnFiredRef.current = false;
      pauseFiredRef.current = false;
    }
  }, [pct]);

  const formatTokens = (n: number): string => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <>
      {/* Bar */}
      <div style={{ width: "100%", position: "relative" }}>
        {/* Track */}
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: T.border,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Fill */}
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: color,
              borderRadius: 2,
              transition: "width 0.3s ease, background 0.3s ease",
            }}
          />
        </div>

        {/* Label */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: T.mono,
              color: pct >= 80 ? color : T.textFaint,
            }}
          >
            {formatTokens(used)} / {formatTokens(max)} tokens
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: T.mono,
              color: pct >= 80 ? color : T.textFaint,
            }}
          >
            {Math.round(pct)}%
          </span>
        </div>
      </div>

      {/* 80% Warning popup */}
      {showWarning && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            right: 24,
            zIndex: 1000,
            background: T.surface,
            border: `1px solid #F59E0B`,
            borderRadius: 10,
            padding: "14px 18px",
            maxWidth: 300,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B", marginBottom: 4 }}>
                80% of token budget used
              </div>
              <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
                {formatTokens(used)} of {formatTokens(max)} tokens consumed. The agent will
                pause automatically at 100%.
              </div>
            </div>
            <button
              onClick={() => setShowWarning(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: T.textFaint,
                fontSize: 16,
                padding: 0,
                lineHeight: 1,
                marginLeft: "auto",
                flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 100% Pause confirmation dialog */}
      {showPauseDialog && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 1001,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1002,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 24,
              width: 360,
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "#EF4444", marginBottom: 8 }}>
              Token budget reached
            </div>
            <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, marginBottom: 20 }}>
              The agent has used <strong>{formatTokens(used)}</strong> of the{" "}
              <strong>{formatTokens(max)}</strong> token budget. Do you want to pause the
              agent or continue anyway?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowPauseDialog(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  background: "transparent",
                  color: T.textSec,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Continue anyway
              </button>
              <button
                onClick={() => {
                  setShowPauseDialog(false);
                  onPause?.();
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#EF4444",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Pause agent
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
