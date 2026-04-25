"use client";

import { useState } from "react";
import { T, S } from "@/lib/tokens";
import { Trash2, X, Plus, Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

const REPO_ID_REGEX = /^repo-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractRepoFromId(id: string): string | null {
  const match = id.match(REPO_ID_REGEX);
  return match ? match[1] : null;
}

type FilterTab = "all" | "repo" | "free" | "incognito";

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ConversationSummary[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewIncognito?: () => void;
  onDelete: (id: string) => Promise<void>;
}

export default function HistoryDrawer({
  open,
  onOpenChange,
  conversations,
  selectedId,
  loading,
  onSelect,
  onNew,
  onNewIncognito,
  onDelete,
}: HistoryDrawerProps) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) => {
    // Filter by tab
    if (filter === "repo" && !c.id.startsWith("repo-")) return false;
    if (filter === "free" && !c.id.startsWith("chat-")) return false;
    if (filter === "incognito" && !c.id.startsWith("inkognito-")) return false;
    // Search
    if (search) {
      const q = search.toLowerCase();
      const title = (c.title || "").toLowerCase();
      const repo = extractRepoFromId(c.id)?.toLowerCase() || "";
      if (!title.includes(q) && !repo.includes(q)) return false;
    }
    return true;
  });

  // Colour of the bullet. activeTask → green, pending review → amber, else indigo.
  const statusColor = (c: ConversationSummary) => {
    if (c.activeTask) return T.success;
    if ((c as any).hasPendingReview) return T.warning;
    return "#6366F1";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 border-l"
        style={{
          width: 360,
          maxWidth: "90vw",
          background: T.surface,
          borderColor: T.border,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SheetHeader className="px-4 pt-4 pb-2" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SheetTitle style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
              Samtaler
            </SheetTitle>
            <button
              onClick={() => onOpenChange(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: T.textMuted,
                padding: 4,
                display: "flex",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 2, marginTop: S.sm }}>
            {(["all", "repo", "free", "incognito"] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontFamily: T.mono,
                  background: filter === tab ? T.subtle : "transparent",
                  color: filter === tab ? T.text : T.textMuted,
                  border: `1px solid ${filter === tab ? T.border : "transparent"}`,
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                {tab === "all" ? "Alle" : tab === "repo" ? "Repo" : tab === "free" ? "Frie" : "Inkognito"}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk..."
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 12,
              fontFamily: T.sans,
              background: T.subtle,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              outline: "none",
              marginTop: S.sm,
            }}
          />
        </SheetHeader>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {loading ? (
            <div style={{ padding: S.xl, textAlign: "center" }}>
              <span style={{ fontSize: 12, color: T.textMuted }}>Laster...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: S.xl, textAlign: "center" }}>
              <span style={{ fontSize: 12, color: T.textFaint }}>Ingen samtaler funnet</span>
            </div>
          ) : (
            filtered.map((c) => {
              const repo = extractRepoFromId(c.id);
              const isSelected = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  className="hist-row"
                  onClick={() => {
                    onSelect(c.id);
                    onOpenChange(false);
                  }}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: isSelected ? T.subtle : "transparent",
                    borderBottom: `1px solid ${T.border}`,
                    position: "relative",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                    {(() => {
                      const color = statusColor(c);
                      const isActive = c.id === selectedId;
                      // Active → filled solid circle. Inactive → empty ring
                      // (colored outline, transparent interior). Box-sizing
                      // border-box so the visual diameter stays 8px in both
                      // variants and list-items don't jump.
                      return (
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            background: isActive ? color : "transparent",
                            border: isActive ? "none" : `1.5px solid ${color}`,
                            flexShrink: 0,
                          }}
                        />
                      );
                    })()}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: c.activeTask ? 600 : 400,
                        color: T.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {c.title || "Ny samtale"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: S.xs, marginTop: 2 }}>
                        {repo && (
                          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{repo}</span>
                        )}
                        <span style={{ fontSize: 10, color: T.textFaint }}>
                          · {timeAgo(c.lastActivity)}
                        </span>
                        {(c as any).messageCount > 0 && (
                          <span style={{ fontSize: 10, color: T.textFaint }}>
                            · {(c as any).messageCount} msg
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className="hist-delete"
                      onClick={async (e) => { e.stopPropagation(); await onDelete(c.id); }}
                      style={{
                        opacity: 0,
                        transition: "opacity 0.15s",
                        cursor: "pointer",
                        color: T.textFaint,
                        display: "flex",
                        alignItems: "center",
                        padding: 2,
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={14} />
                    </span>
                  </div>
                  <style>{`.hist-row:hover .hist-delete { opacity: 1 !important; }`}</style>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom actions */}
        <div style={{
          padding: S.md,
          borderTop: `1px solid ${T.border}`,
          display: "flex",
          gap: S.sm,
        }}>
          <button
            onClick={() => { onNew(); onOpenChange(false); }}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 500,
              color: T.text,
              background: T.subtle,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            <Plus size={14} /> Ny samtale
          </button>
          {onNewIncognito && (
            <button
              onClick={() => { onNewIncognito(); onOpenChange(false); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 12px",
                fontSize: 12,
                color: T.textMuted,
                background: "transparent",
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <Lock size={14} /> Inkognito
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
