"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ToolCall } from "@/hooks/useAgentStream";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

function JsonBlock({ value }: { value: unknown }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre
      className="text-[11px] leading-relaxed overflow-x-auto p-2.5 rounded-md font-mono"
      style={{
        background: "var(--tf-bg-base)",
        color: "var(--tf-text-secondary)",
        border: "1px solid var(--tf-border-faint)",
        maxHeight: 240,
        overflowY: "auto",
      }}
    >
      {text}
    </pre>
  );
}

function StatusBadge({ status }: { status: ToolCall["status"] }) {
  if (status === "running") {
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
        style={{
          background: "rgba(99,102,241,0.1)",
          color: "rgba(99,102,241,0.9)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        running
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
        style={{
          background: "rgba(239,68,68,0.1)",
          color: "var(--tf-error, #ef4444)",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <XCircle className="w-2.5 h-2.5" />
        error
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{
        background: "rgba(52,211,153,0.1)",
        color: "var(--tf-success, #34d399)",
        border: "1px solid rgba(52,211,153,0.2)",
      }}
    >
      <CheckCircle2 className="w-2.5 h-2.5" />
      done
    </span>
  );
}

function SectionToggle({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide w-full text-left py-1"
          style={{ color: "var(--tf-text-faint)" }}
        >
          <ChevronRight
            className="w-3 h-3 transition-transform duration-150"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          />
          {label}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Displays a single tool call with:
 * - Tool name + status badge in a header row
 * - Duration (when available)
 * - Expandable Input section (JSON)
 * - Expandable Result section (JSON)
 */
export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const { toolName, input, result, durationMs, isError, status } = toolCall;
  const hasInput = input && Object.keys(input).length > 0;
  const hasResult = result !== undefined && result !== null;

  return (
    <div
      className="rounded-lg text-sm"
      style={{
        background: "var(--tf-surface-raised)",
        border: `1px solid ${isError ? "rgba(239,68,68,0.25)" : "var(--tf-border-faint)"}`,
        padding: "8px 12px",
        maxWidth: 480,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {/* Tool name */}
        <span
          className="font-mono text-[11px] font-medium truncate flex-1 min-w-0"
          style={{ color: "var(--tf-text-primary)" }}
        >
          {toolName}
        </span>

        {/* Duration */}
        {typeof durationMs === "number" && (
          <span
            className="text-[10px] tabular-nums flex-shrink-0"
            style={{ color: "var(--tf-text-faint)" }}
          >
            {durationMs < 1000
              ? `${durationMs}ms`
              : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        )}

        <StatusBadge status={status} />
      </div>

      {/* Expandable sections */}
      {(hasInput || hasResult) && (
        <div className="mt-2 flex flex-col gap-0.5">
          {hasInput && (
            <SectionToggle label="Input">
              <JsonBlock value={input} />
            </SectionToggle>
          )}
          {hasResult && (
            <SectionToggle label={isError ? "Error" : "Result"}>
              <JsonBlock value={result} />
            </SectionToggle>
          )}
        </div>
      )}
    </div>
  );
}
