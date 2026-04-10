"use client";

import { T } from "@/lib/tokens";
import { Trash2 } from "lucide-react";
import type { ConversationSummary } from "@/lib/api";

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mnd`;
}

export function extractRepoFromId(id: string): string | null {
  if (!id.startsWith("repo-")) return null;
  const rest = id.substring(5);
  const parts = rest.split("-");
  return parts.length >= 6 ? parts.slice(0, parts.length - 5).join("-") : rest;
}

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
}

export default function ConversationSidebar({
  conversations,
  selectedId,
  loading,
  onSelect,
  onNew,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <div style={{
      borderRight: `1px solid ${T.border}`,
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      alignSelf: "stretch",
    }}>
      <div style={{
        padding: "16px 16px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted, fontFamily: T.mono }}>
          Samtaler
        </span>
        <div
          onClick={onNew}
          style={{
            width: 32, height: 32, borderRadius: 999,
            border: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", background: "transparent", flexShrink: 0,
          }}
          title="Ny samtale"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: "20px 16px", textAlign: "center" }}>
            <span style={{ fontSize: 12, color: T.textMuted }}>Laster...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: "20px 16px", textAlign: "center" }}>
            <span style={{ fontSize: 12, color: T.textFaint }}>Ingen samtaler enda</span>
          </div>
        ) : (
          conversations.map((c) => {
            const repo = extractRepoFromId(c.id);
            return (
              <div
                key={c.id}
                className="conv-row"
                onClick={() => onSelect(c.id)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  background: selectedId === c.id ? T.subtle : "transparent",
                  borderBottom: `1px solid ${T.border}`,
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: c.activeTask ? 600 : 400,
                    color: c.activeTask ? T.text : T.textSec,
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {c.title || "Ny samtale"}
                  </span>
                  <span
                    className="conv-delete"
                    onClick={async (e) => { e.stopPropagation(); await onDelete(c.id); }}
                    style={{
                      opacity: 0, transition: "opacity 0.15s",
                      cursor: "pointer", color: T.textFaint,
                      display: "flex", alignItems: "center", padding: 2, flexShrink: 0,
                    }}
                  >
                    <Trash2 size={14} />
                  </span>
                  <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono, flexShrink: 0 }}>
                    {timeAgo(c.lastActivity)}
                  </span>
                </div>
                {repo && (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{repo}</span>
                  </div>
                )}
                <style>{`.conv-row:hover .conv-delete { opacity: 1 !important; }`}</style>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
