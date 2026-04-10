"use client";

import { T } from "@/lib/tokens";

export interface ErrorCardProps {
  /** Short error code, e.g. "tool_call_failed", "max_loops", "ai_error" */
  code?: string;
  /** Human-readable error message */
  message: string;
  /** true = agent can continue / retry, false = fatal */
  recoverable?: boolean;
  /** How many retry attempts have been made */
  retryCount?: number;
  /** Max allowed retries (to show X/N) */
  maxRetries?: number;
  onRetry?: () => void;
  onSkip?: () => void;
  onAbort?: () => void;
}

const btnBase: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "inherit",
  fontWeight: 500,
  cursor: "pointer",
  border: "none",
  letterSpacing: "-0.01em",
  transition: "opacity 0.15s",
};

export default function ErrorCard({
  code,
  message,
  recoverable = false,
  retryCount,
  maxRetries,
  onRetry,
  onSkip,
  onAbort,
}: ErrorCardProps) {
  const borderColor = recoverable ? T.warning : T.error;
  const bgColor = recoverable ? `${T.warning}14` : `${T.error}14`;
  const labelColor = recoverable ? T.warning : T.error;

  const hasActions = onRetry || onSkip || onAbort;

  return (
    <div
      role="alert"
      style={{
        borderRadius: 10,
        border: `1.5px solid ${borderColor}`,
        background: bgColor,
        padding: "12px 14px",
        marginBottom: 8,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: message ? 8 : 0,
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
          {recoverable ? "⚠️" : "❌"}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: labelColor,
              }}
            >
              {recoverable ? "Gjenopprettbar feil" : "Fatal feil"}
            </span>

            {code && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: T.mono,
                  color: labelColor,
                  background: `${borderColor}20`,
                  padding: "1px 6px",
                  borderRadius: 4,
                  border: `1px solid ${borderColor}40`,
                }}
              >
                {code}
              </span>
            )}

            {retryCount !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: T.mono,
                  color: T.textFaint,
                  marginLeft: "auto",
                }}
              >
                forsøk {retryCount}{maxRetries !== undefined ? `/${maxRetries}` : ""}
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: 12,
              color: T.textSec,
              lineHeight: 1.6,
              wordBreak: "break-word",
            }}
          >
            {message}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {hasActions && (
        <div
          style={{
            display: "flex",
            gap: 8,
            paddingTop: 10,
            borderTop: `1px solid ${borderColor}30`,
          }}
        >
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                ...btnBase,
                background: recoverable ? T.warning : T.error,
                color: "#fff",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Prøv igjen
            </button>
          )}

          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                ...btnBase,
                background: T.subtle,
                color: T.textSec,
                border: `1px solid ${T.border}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Hopp over
            </button>
          )}

          {onAbort && (
            <button
              onClick={onAbort}
              style={{
                ...btnBase,
                background: "transparent",
                color: T.error,
                border: `1px solid ${T.error}60`,
                marginLeft: "auto",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Avbryt
            </button>
          )}
        </div>
      )}
    </div>
  );
}
