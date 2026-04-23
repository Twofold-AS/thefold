"use client";

// --- ToolCallDetailModal (U3) ---
// Radix Dialog-based modal that shows full input/output for a tool call.
// Opens on click from ToolCallLine; does not push chat content around.

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { T } from "@/lib/tokens";
import type { ToolCallLineData } from "./types";

interface ToolCallDetailModalProps {
  data: ToolCallLineData | null;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function JsonBlock({ value, maxHeight = 280 }: { value: unknown; maxHeight?: number }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre
      style={{
        background: "rgba(0,0,0,0.25)",
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: 10,
        fontSize: 11,
        lineHeight: 1.5,
        fontFamily: T.mono,
        color: T.textSec,
        maxHeight,
        overflow: "auto",
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
    </pre>
  );
}

export default function ToolCallDetailModal({ data, onClose }: ToolCallDetailModalProps) {
  const open = data !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 200,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(640px, 92vw)",
            maxHeight: "75vh",
            background: "rgba(20,20,24,0.96)",
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: 20,
            overflowY: "auto",
            zIndex: 201,
            color: T.text,
            fontFamily: T.sans,
          }}
        >
          {data && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <Dialog.Title
                  style={{
                    fontFamily: T.mono,
                    fontSize: 14,
                    fontWeight: 600,
                    color: T.text,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {data.toolName}
                </Dialog.Title>
                <span
                  style={{
                    fontSize: 11,
                    color:
                      data.status === "error"
                        ? T.error
                        : data.status === "done"
                          ? T.success
                          : T.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {data.status}
                </span>
                {typeof data.durationMs === "number" && (
                  <span
                    style={{
                      fontSize: 11,
                      color: T.textFaint,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatDuration(data.durationMs)}
                  </span>
                )}
                <Dialog.Close asChild>
                  <button
                    aria-label="Lukk"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: T.textMuted,
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                    }}
                  >
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>

              <Dialog.Description asChild>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.input && Object.keys(data.input).length > 0 && (
                    <section>
                      <div style={sectionLabelStyle}>Input</div>
                      <JsonBlock value={data.input} />
                    </section>
                  )}
                  {data.result !== undefined && data.result !== null && (
                    <section>
                      <div style={sectionLabelStyle}>
                        {data.isError ? "Feil" : "Resultat"}
                      </div>
                      <JsonBlock value={data.result} />
                    </section>
                  )}
                  {data.errorMessage && !data.result && (
                    <section>
                      <div style={sectionLabelStyle}>Feilmelding</div>
                      <JsonBlock value={data.errorMessage} />
                    </section>
                  )}
                  <section>
                    <div style={sectionLabelStyle}>Metadata</div>
                    <div style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>
                      tool_call_id: {data.id}
                    </div>
                  </section>
                </div>
              </Dialog.Description>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const sectionLabelStyle = {
  fontSize: 10,
  fontFamily: "inherit",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: T.textFaint,
  marginBottom: 6,
  fontWeight: 500,
};
