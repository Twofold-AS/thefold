"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional fallback to render instead of the default error UI */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /** Section name shown in the error UI (e.g. "Chat", "Tasks") */
  section?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to backend if available — fire-and-forget
    try {
      fetch("/api/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          section: this.props.section,
          url: typeof window !== "undefined" ? window.location.href : undefined,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {
        // Ignore — logging is best-effort
      });
    } catch {
      // Never let logging break the error boundary itself
    }

    console.error("[ErrorBoundary]", error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.handleRetry);
    }

    return <DefaultErrorUI error={error} section={this.props.section} onRetry={this.handleRetry} />;
  }
}

// --- Default error UI (uses inline styles — no T import to keep this standalone) ---

function DefaultErrorUI({
  error,
  section,
  onRetry,
}: {
  error: Error;
  section?: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
        minHeight: 200,
      }}
    >
      {/* Error icon */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        style={{ marginBottom: 16, opacity: 0.6 }}
      >
        <circle cx="20" cy="20" r="18" stroke="rgb(208, 59, 43)" strokeWidth="2" />
        <path
          d="M20 12v10M20 27v1"
          stroke="rgb(208, 59, 43)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "rgb(208, 59, 43)",
          marginBottom: 6,
        }}
      >
        {section ? `${section} encountered an error` : "Something went wrong"}
      </div>

      <div
        style={{
          fontSize: 12,
          color: "#94A3B8",
          marginBottom: 20,
          maxWidth: 320,
          lineHeight: 1.6,
          fontFamily: "monospace",
          wordBreak: "break-word",
        }}
      >
        {error.message || "An unexpected error occurred"}
      </div>

      <button
        onClick={onRetry}
        style={{
          padding: "8px 20px",
          borderRadius: 6,
          border: "1px solid #D9D9D2",
          background: "rgb(255, 90, 54)",
          color: "#FFFFFF",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Retry
      </button>
    </div>
  );
}

export default ErrorBoundary;
