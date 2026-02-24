"use client";

import { useRef, useEffect, useCallback } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFileUpload?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** When true, show orange "Run Agent" pill button instead of circle arrow */
  showRunAgent?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onFileUpload,
  disabled,
  isStreaming,
  onStop,
  placeholder = "Ask TheFold to build, fix, or analyze your code...",
  showRunAgent,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "48px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  return (
    <div
      className="rounded-xl transition-colors overflow-hidden"
      style={{
        background: "var(--tf-surface)",
        border: "1px solid var(--tf-border-muted)",
      }}
    >
      {/* Input area */}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* File upload */}
        {onFileUpload && (
          <button
            type="button"
            onClick={onFileUpload}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors flex-shrink-0 mb-0.5 hover:bg-[var(--tf-surface-raised)]"
            style={{ color: "var(--tf-text-faint)" }}
          >
            <Paperclip className="w-4 h-4" />
          </button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none text-sm leading-relaxed"
          style={{
            color: "var(--tf-text-primary)",
            minHeight: "48px",
            maxHeight: "160px",
          }}
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors flex-shrink-0 mb-0.5"
            style={{
              background: "var(--tf-border-muted)",
              color: "var(--tf-text-primary)",
            }}
          >
            <Square className="w-3.5 h-3.5" fill="currentColor" />
          </button>
        ) : showRunAgent ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className="flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-[0.98] flex-shrink-0 mb-0.5"
            style={{
              background: value.trim() ? "var(--tf-heat)" : "var(--tf-border-faint)",
              color: value.trim() ? "white" : "var(--tf-text-faint)",
              opacity: !value.trim() ? 0.5 : 1,
            }}
          >
            Run Agent
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all flex-shrink-0 mb-0.5 active:scale-[0.95]"
            style={{
              background: value.trim() ? "var(--tf-heat)" : "var(--tf-border-faint)",
              color: value.trim() ? "white" : "var(--tf-text-faint)",
              opacity: !value.trim() ? 0.5 : 1,
            }}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
