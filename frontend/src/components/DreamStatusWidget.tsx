"use client";

// --- DreamStatusWidget (Fase G, Commit 39) ---
// Persistent bottom-right widget that appears while a sleep/dream cycle is
// running. Co-located with sonner toasts but positioned slightly lower so
// transient toasts always float ABOVE the widget without overlap.
//
// The X-close is UI-only: it hides the widget for the current session but
// does NOT stop the underlying sleep job. Next page load re-polls and shows
// the widget again if sleep is still running.

import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { T } from "@/lib/tokens";
import { useDreamStatus } from "@/hooks/useDreamStatus";

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}t ${mm.toString().padStart(2, "0")}m`;
}

export default function DreamStatusWidget() {
  const status = useDreamStatus();
  // dismissedFor tracks the startedAt the user last closed — lets us
  // re-show automatically when a NEW sleep cycle starts later in the session.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  // Auto-reset the dismissal when sleep ends so the next cycle is visible.
  useEffect(() => {
    if (!status.isRunning) {
      setDismissedFor(null);
    }
  }, [status.isRunning]);

  if (!status.isRunning) return null;
  if (dismissedFor && dismissedFor === status.startedAt) return null;

  const elapsed = status.elapsedSeconds ?? 0;
  const progressLabel =
    status.progress && status.phase
      ? `Fase ${status.progress.step}/${status.progress.total}: ${status.phase}`
      : status.phase ?? "Starter...";

  return (
    <>
      <style>{`
        @keyframes tf-dream-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.05); }
        }
        @keyframes tf-dream-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .tf-dream-icon {
          animation: tf-dream-pulse 2.2s ease-in-out infinite;
        }
        .tf-dream-card {
          background: linear-gradient(
            120deg,
            rgba(168, 85, 247, 0.14) 0%,
            rgba(180, 151, 207, 0.10) 50%,
            rgba(168, 85, 247, 0.14) 100%
          );
          background-size: 200% 100%;
          animation: tf-dream-shimmer 6s linear infinite;
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        aria-label="Dream-syklus pågår"
        className="tf-dream-card"
        style={{
          position: "fixed",
          right: 16,
          // Sit below the toast stack — sonner defaults to bottom 24-32px.
          bottom: 16,
          zIndex: 90,
          width: 260,
          padding: "10px 12px",
          border: `1px solid rgba(168, 85, 247, 0.35)`,
          borderRadius: 10,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          fontFamily: T.sans,
          color: T.text,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Sparkles
            size={14}
            color="#93C5FD"
            className="tf-dream-icon"
            aria-hidden="true"
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, flex: 1 }}>
            Drømming pågår
          </span>
          <button
            type="button"
            aria-label="Skjul dream-widget"
            onClick={() => setDismissedFor(status.startedAt ?? "unknown")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: T.textMuted,
              padding: 2,
              display: "flex",
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>
          {progressLabel}
        </div>
        <div
          style={{
            fontSize: 11,
            color: T.textFaint,
            fontFamily: T.mono,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ⏱ {formatElapsed(elapsed)}
        </div>
      </div>
    </>
  );
}
