"use client";

interface TypingIndicatorProps {
  statusText?: string | null;
}

/**
 * Three-dot pulsing typing indicator, shown while the assistant is generating a response.
 * Appears instantly on send with an optional status label that updates via SSE.
 */
export default function TypingIndicator({ statusText }: TypingIndicatorProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "4px 0",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      {/* Bot avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          flexShrink: 0,
          background: "var(--tf-surface, #1a1a1a)",
          border: "1px solid var(--tf-border, #2a2a2a)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="6" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.2" style={{ color: "var(--tf-text-faint, #666)" }} />
          <rect x="6" y="3" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" style={{ color: "var(--tf-text-faint, #666)" }} />
          <circle cx="5.5" cy="9.5" r="1" fill="currentColor" style={{ color: "var(--tf-text-faint, #666)" }} />
          <circle cx="10.5" cy="9.5" r="1" fill="currentColor" style={{ color: "var(--tf-text-faint, #666)" }} />
        </svg>
      </div>

      {/* Bubble with dots */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "10px 14px",
            background: "var(--tf-surface, #1a1a1a)",
            border: "1px solid var(--tf-border, #2a2a2a)",
            borderRadius: 6,
          }}
        >
          <style>{`
            @keyframes tf-bounce {
              0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
              30% { opacity: 1; transform: translateY(-3px); }
            }
            .tf-typing-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: var(--tf-text-faint, #666);
              animation: tf-bounce 1.4s ease-in-out infinite;
            }
            .tf-typing-dot:nth-child(2) { animation-delay: 0.2s; }
            .tf-typing-dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div className="tf-typing-dot" />
          <div className="tf-typing-dot" />
          <div className="tf-typing-dot" />
        </div>

        {statusText && (
          <span
            style={{
              fontSize: 11,
              color: "var(--tf-text-faint, #666)",
              fontFamily: "var(--tf-mono, monospace)",
              paddingLeft: 2,
            }}
          >
            {statusText}
          </span>
        )}
      </div>
    </div>
  );
}
