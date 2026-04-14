"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { searchMemories, deleteMemory, MemorySearchResult } from "@/lib/api";

const MEMORY_TYPES = ["decision", "error_pattern", "strategy", "session", "skill", "task", "general"] as const;
type MemoryTypeFilter = (typeof MEMORY_TYPES)[number] | "all";

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "i dag";
  if (days === 1) return "1d";
  return `${days}d`;
}

function typeVariant(memoryType: string): "accent" | "error" | "success" | "default" {
  switch (memoryType) {
    case "decision": return "accent";
    case "error_pattern": return "error";
    case "strategy": return "success";
    default: return "default";
  }
}

function DecayBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? T.success : pct >= 40 ? T.accent : T.warning;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: T.subtle, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s ease" }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textMuted, width: 28, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

function EntryRow({
  m,
  expanded,
  onToggle,
  onDelete,
}: {
  m: MemorySearchResult;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Slett dette minnet?")) return;
    setDeleting(true);
    try {
      await deleteMemory(m.id);
      onDelete(m.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div
      style={{
        borderBottom: `1px solid ${T.border}`,
        background: expanded ? T.subtle : "transparent",
        cursor: "pointer",
        transition: "background 0.15s",
        opacity: deleting ? 0.4 : 1,
      }}
      onClick={onToggle}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 110px 90px 48px 28px",
          alignItems: "center",
          padding: "11px 16px",
          gap: 12,
        }}
      >
        {/* Content preview */}
        <div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.4 }}>
            {m.content.length > 90 ? m.content.slice(0, 90) + "…" : m.content}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
            <Tag variant={typeVariant(m.memoryType)}>{m.memoryType}</Tag>
            <span style={{ fontSize: 10, color: T.textFaint }}>{formatAge(m.createdAt)}</span>
            {m.tags?.slice(0, 2).map((t) => (
              <span key={t} style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Source */}
        <div style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.sourceRepo ?? "—"}
        </div>

        {/* Decay */}
        <div>
          <DecayBar value={Number(m.decayedScore) || 0} />
        </div>

        {/* Usage */}
        <div style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec, textAlign: "right" }}>
          {m.accessCount}x
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Slett"
          style={{
            background: "none",
            border: "none",
            color: T.textFaint,
            cursor: "pointer",
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = T.error)}
          onMouseOut={(e) => (e.currentTarget.style.color = T.textFaint)}
        >
          ×
        </button>
      </div>

      {expanded && (
        <div
          style={{ padding: "0 16px 14px", borderTop: `1px solid ${T.border}` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              fontSize: 12,
              color: T.textSec,
              lineHeight: 1.6,
              fontFamily: m.memoryType === "error_pattern" ? T.mono : T.sans,
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "10px 14px",
              marginTop: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {m.content}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>id: {m.id.slice(0, 8)}…</span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              sim: {((Number(m.similarity) || 0) * 100).toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              decay: {((Number(m.decayedScore) || 0) * 100).toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              relevans: {((Number(m.relevanceScore) || 0) * 100).toFixed(1)}%
            </span>
            {m.tags?.length > 0 && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                tags: {m.tags.join(", ")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function KnowledgePage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryTypeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const { data, loading } = useApiData(
    () => searchMemories(debouncedQuery, {
      limit: 50,
      memoryType: typeFilter !== "all" ? typeFilter : undefined,
    }),
    [debouncedQuery, typeFilter],
  );

  const handleDelete = useCallback((id: string) => {
    setDeletedIds((prev) => new Set([...prev, id]));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const allResults: MemorySearchResult[] = data?.results ?? [];
  const results = allResults.filter((r) => !deletedIds.has(r.id));

  return (
    <>
      <div style={{ paddingTop: 0, paddingBottom: 24 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: T.text,
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}
        >
          Kunnskapsbase
        </h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>
          Semantisk minne — mønster, beslutninger og kontekst fra tidligere oppgaver.
        </p>
      </div>

      {/* Search bar */}
      <GR>
        <div
          style={{
            position: "relative",
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.surface,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 14,
              color: T.textFaint,
              pointerEvents: "none",
            }}
          >
            ⌕
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk i minner, mønstre og beslutninger…"
            style={{
              width: "100%",
              padding: "14px 16px 14px 44px",
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: T.text,
              fontFamily: T.sans,
              boxSizing: "border-box",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: T.textFaint,
                cursor: "pointer",
                fontSize: 16,
                padding: "4px 8px",
              }}
            >
              ×
            </button>
          )}
        </div>
      </GR>

      {/* Category filter chips */}
      <GR>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 12 }}>
          {(["all", ...MEMORY_TYPES] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${typeFilter === type ? T.accent : T.border}`,
                background: typeFilter === type ? T.accentDim : "transparent",
                color: typeFilter === type ? T.accent : T.textMuted,
                fontSize: 11,
                fontFamily: T.mono,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {type === "all" ? "Alle" : type}
            </button>
          ))}
        </div>
      </GR>

      {/* Results */}
      <GR mb={40}>
        <div
          style={{
            marginTop: 16,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            overflow: "hidden",
          }}
        >
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 90px 48px 28px",
              padding: "8px 16px",
              gap: 12,
              background: T.subtle,
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            {["INNHOLD", "KILDE", "STYRKE", "BRUK", ""].map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: T.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  textAlign: i === 3 ? "right" : "left",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 24 }}>
              <Skeleton rows={6} />
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 14, color: T.textMuted }}>
                {debouncedQuery
                  ? `Ingen minner funnet for "${debouncedQuery}"`
                  : typeFilter !== "all"
                  ? `Ingen minner av type "${typeFilter}"`
                  : "Ingen minner lagret ennå."}
              </div>
              {(debouncedQuery || typeFilter !== "all") && (
                <div style={{ fontSize: 12, color: T.textFaint, marginTop: 6 }}>
                  Prøv et bredere søkeord eller fjern filteret.
                </div>
              )}
            </div>
          ) : (
            <>
              {results.map((m) => (
                <EntryRow
                  key={m.id}
                  m={m}
                  expanded={expandedId === m.id}
                  onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  onDelete={handleDelete}
                />
              ))}
              <div
                style={{
                  padding: "10px 16px",
                  borderTop: `1px solid ${T.border}`,
                  background: T.subtle,
                }}
              >
                <SectionLabel>{results.length} resultater</SectionLabel>
              </div>
            </>
          )}
        </div>
      </GR>
    </>
  );
}
