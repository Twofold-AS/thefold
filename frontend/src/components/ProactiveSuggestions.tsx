"use client";

import { useState, useCallback } from "react";
import { T } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { getSuggestions, type Suggestion } from "@/lib/api/agent";

interface Props {
  repo?: string;
  onStartTask?: (description: string, repo?: string) => void;
  compact?: boolean;
}

function priorityColor(priority: Suggestion["priority"]): string {
  switch (priority) {
    case "critical": return T.error;
    case "high": return T.warning;
    case "medium": return T.accent;
    default: return T.textMuted;
  }
}

function typeIcon(type: Suggestion["type"]): string {
  switch (type) {
    case "cve": return "🔒";
    case "outdated_dep": return "📦";
    case "test_coverage": return "🧪";
    case "error_pattern": return "⚡";
    case "similar_failure": return "🔁";
    default: return "💡";
  }
}

function SuggestionCard({
  s,
  onStartTask,
}: {
  s: Suggestion;
  onStartTask?: (description: string, repo?: string) => void;
}) {
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (!s.actionTaskDescription || !onStartTask) return;
    setStarting(true);
    try {
      onStartTask(s.actionTaskDescription, s.repo);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        borderBottom: `1px solid ${T.border}`,
        background: "transparent",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{typeIcon(s.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: priorityColor(s.priority),
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{s.title}</span>
          {s.repo && (
            <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, marginLeft: "auto" }}>
              {s.repo.split("/")[1] || s.repo}
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11,
          color: T.textMuted,
          margin: "3px 0 0",
          lineHeight: 1.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {s.description}
        </p>
        {s.actionLabel && s.actionTaskDescription && onStartTask && (
          <button
            onClick={handleStart}
            disabled={starting}
            style={{
              marginTop: 6,
              padding: "3px 10px",
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 999,
              fontSize: 10,
              color: starting ? T.textFaint : T.accent,
              cursor: starting ? "default" : "pointer",
              fontFamily: T.mono,
              transition: "all 0.15s",
            }}
          >
            {starting ? "Starter…" : s.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProactiveSuggestions({ repo, onStartTask, compact }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const fetchSuggestions = useCallback(
    () => getSuggestions(repo, compact ? 4 : 8),
    [repo, compact]
  );

  const { data, loading } = useApiData(fetchSuggestions, [repo]);

  const suggestions = data?.suggestions ?? [];

  if (dismissed || (!loading && suggestions.length === 0)) return null;

  return (
    <div
      style={{
        borderRadius: T.r * 1.5,
        border: `1px solid ${T.border}`,
        background: T.surface,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: `1px solid ${T.border}`,
          background: T.subtle,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12 }}>🤖</span>
          <span style={{ fontSize: 11, color: T.textSec, fontWeight: 500 }}>
            Proaktive forslag
          </span>
          {!loading && (
            <span style={{
              fontSize: 10,
              color: T.textFaint,
              background: T.subtle,
              border: `1px solid ${T.border}`,
              borderRadius: 999,
              padding: "1px 6px",
              fontFamily: T.mono,
            }}>
              {suggestions.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            color: T.textFaint,
            cursor: "pointer",
            fontSize: 14,
            padding: "2px 6px",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Suggestions */}
      {loading ? (
        <div style={{ padding: "12px 14px" }}>
          {[...Array(compact ? 2 : 3)].map((_, i) => (
            <div key={i} style={{
              height: 52,
              background: T.subtle,
              borderRadius: 4,
              marginBottom: 6,
              opacity: 1 - i * 0.2,
            }} />
          ))}
        </div>
      ) : (
        suggestions.map((s, idx) => (
          <SuggestionCard key={s.id ?? `suggestion-${idx}`} s={s} onStartTask={onStartTask} />
        ))
      )}
    </div>
  );
}
