"use client";

import { useMemo } from "react";
import { Bot, User, Copy, Check } from "lucide-react";
import { useState } from "react";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  model?: string;
  tokens?: number;
  cost?: number;
  isContextTransfer?: boolean;
}

export function ChatBubble({
  role,
  content,
  timestamp,
  model,
  tokens,
  cost,
  isContextTransfer,
}: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedTime = useMemo(() => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [timestamp]);

  // Render markdown-lite: code blocks, bold, inline code, lists
  const rendered = useMemo(() => {
    if (!content) return null;

    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.slice(3, -3);
        const langMatch = lines.match(/^(\w+)\n/);
        const lang = langMatch ? langMatch[1] : "";
        const code = langMatch ? lines.slice(langMatch[0].length) : lines;
        return (
          <pre
            key={i}
            className="my-2 rounded-lg p-3 text-xs font-mono overflow-x-auto"
            style={{ background: "var(--tf-bg-base)", border: "1px solid var(--tf-border-faint)" }}
          >
            {lang && (
              <span className="text-[10px] block mb-1" style={{ color: "var(--tf-text-faint)" }}>
                {lang}
              </span>
            )}
            <code style={{ color: "var(--tf-text-secondary)" }}>{code}</code>
          </pre>
        );
      }

      return (
        <span key={i}>
          {part.split(/(\*\*.*?\*\*|\`.*?\`)/g).map((seg, j) => {
            if (seg.startsWith("**") && seg.endsWith("**")) {
              return (
                <strong key={j} style={{ color: "var(--tf-text-primary)" }}>
                  {seg.slice(2, -2)}
                </strong>
              );
            }
            if (seg.startsWith("`") && seg.endsWith("`")) {
              return (
                <code
                  key={j}
                  className="px-1 py-0.5 rounded text-xs font-mono"
                  style={{
                    background: "var(--tf-bg-base)",
                    color: "var(--tf-heat)",
                    border: "1px solid var(--tf-border-faint)",
                  }}
                >
                  {seg.slice(1, -1)}
                </code>
              );
            }
            return seg;
          })}
        </span>
      );
    });
  }, [content]);

  if (isContextTransfer) {
    return (
      <div className="flex items-center gap-2 py-2 animate-message-enter">
        <div className="h-px flex-1" style={{ background: "var(--tf-border-faint)" }} />
        <span
          className="text-[10px] px-2 py-0.5 rounded font-medium"
          style={{ background: "rgba(66, 195, 102, 0.1)", color: "var(--tf-success)" }}
        >
          Context transferred
        </span>
        <div className="h-px flex-1" style={{ background: "var(--tf-border-faint)" }} />
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 group animate-message-enter ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: isUser ? "var(--tf-heat)" : "var(--tf-surface-raised)",
          border: isUser ? "none" : "1px solid var(--tf-border-faint)",
        }}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-white" />
        ) : (
          <Bot className="w-3.5 h-3.5" style={{ color: "var(--tf-text-secondary)" }} />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {isUser ? (
          /* User bubble — with background and border */
          <div
            className="inline-block text-sm leading-relaxed rounded-xl px-4 py-2.5 whitespace-pre-wrap max-w-[75%]"
            style={{
              background: "rgba(53, 88, 114, 0.08)",
              color: "var(--tf-text-primary)",
              border: "1px solid rgba(53, 88, 114, 0.12)",
              textAlign: "left",
            }}
          >
            {rendered}
          </div>
        ) : (
          /* Assistant — NO bubble, just text like Claude/ChatGPT */
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap max-w-full"
            style={{
              color: "var(--tf-text-secondary)",
            }}
          >
            {rendered}
          </div>
        )}

        {/* Metadata row */}
        <div
          className="flex items-center gap-2 mt-1 px-1 flex-wrap"
          style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}
        >
          {formattedTime && (
            <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
              {formattedTime}
            </span>
          )}
          {model && (
            <span className="text-[10px] tag-heat">{model}</span>
          )}
          {tokens != null && tokens > 0 && (
            <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
              {tokens.toLocaleString()} tokens
            </span>
          )}
          {cost != null && cost > 0 && (
            <span className="text-[10px]" style={{ color: "var(--tf-text-faint)" }}>
              ${cost.toFixed(4)}
            </span>
          )}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
              style={{ color: "var(--tf-text-faint)" }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
