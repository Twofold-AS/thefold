"use client";

import { useState } from "react";
import { Monitor, X, ExternalLink, RefreshCw } from "lucide-react";

interface LivePreviewProps {
  isActive: boolean;
  onClose: () => void;
}

export function LivePreview({ isActive, onClose }: LivePreviewProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!isActive) return null;

  return (
    <div className="live-preview-container" style={{
      width: "100%",
      height: "100%",
      background: "var(--bg-primary)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Monitor size={18} />
          <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>Live Preview</span>
          {isLoading && (
            <RefreshCw size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          )}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 2000);
            }}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "4px",
              cursor: "pointer",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
            title="Oppdater"
          >
            <RefreshCw size={16} />
          </button>

          <button
            onClick={() => window.open("about:blank", "_blank")}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "4px",
              cursor: "pointer",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
            title="Åpne i ny fane"
          >
            <ExternalLink size={16} />
          </button>

          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "4px",
              cursor: "pointer",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
            title="Lukk"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Preview Area - PLACEHOLDER */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-secondary, #f5f5f5)",
        position: "relative",
      }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <Monitor size={48} style={{ margin: "0 auto 16px", opacity: 0.3 }} />
          <div className="font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Live Preview</div>
          <div className="text-sm">
            Viser endringer i sanntid n&aring;r TheFold jobber
          </div>
          <div className="text-xs mt-4" style={{ opacity: 0.6 }}>
            (Kommer i fremtidig versjon)
          </div>
        </div>

        {/* Fake loading overlay */}
        {isLoading && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <RefreshCw size={32} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        )}
      </div>

      {/* Footer med URL bar (fake) */}
      <div style={{
        padding: "8px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-card)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <div style={{
          flex: 1,
          padding: "6px 12px",
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          fontSize: "12px",
          fontFamily: "monospace",
          color: "var(--text-muted)",
        }}>
          https://preview-{"{sandbox-id}"}.thefold.dev
        </div>
      </div>
    </div>
  );
}
