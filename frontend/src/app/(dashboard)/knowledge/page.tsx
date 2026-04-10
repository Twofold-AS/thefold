"use client";

import { useState, useEffect, useRef } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { searchMemories, MemorySearchResult } from "@/lib/api";

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "i dag";
  if (days === 1) return "1d";
  return `${days}d`;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? T.success : pct >= 40 ? T.accent : T.warning;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          background: T.subtle,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted, width: 30 }}>
        {pct}%
      </span>
    </div>
  );
}

function EntryRow({ m, expanded, onToggle }: { m: MemorySearchResult; expanded: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        borderBottom: `1px solid ${T.border}`,
        background: expanded ? T.subtle : "transparent",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onClick={onToggle}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 120px 100px 60px 24px",
          alignItems: "center",
          padding: "12px 16px",
          gap: 12,
        }}
      >
        {/* Content preview */}
        <div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.4 }}>
            {m.content.length > 80 ? m.content.slice(0, 80) + "…" : m.content}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <Tag
              variant={
                m.memoryType === "error_pattern"
                  ? "error"
                  : m.memoryType === "decision"
                  ? "accent"
                  : "default"
              }
            >
              {m.memoryType}
            </Tag>
            <span style={{ fontSize: 10, color: T.textFaint }}>{formatAge(m.createdAt)}</span>
          </div>
        </div>

        {/* Source */}
        <div style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.sourceRepo ?? "—"}
        </div>

        {/* Confidence */}
        <div>
          <ConfidenceBar value={Number(m.relevanceScore) || 0} />
        </div>

        {/* Usage */}
        <div style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec, textAlign: "right" }}>
          {m.accessCount}x
        </div>

        {/* Chevron */}
        <div
          style={{
            fontSize: 10,
            color: T.textFaint,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            textAlign: "center",
          }}
        >
          ▶
        </div>
      </div>

      {expanded && (
        <div
          style={{
            padding: "0 16px 16px",
            borderTop: `1px solid ${T.border}`,
          }}
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
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              id: {m.id.slice(0, 8)}…
            </span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              similarity: {((Number(m.similarity) || 0) * 100).toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              decay: {((Number(m.decayedScore) || 0) * 100).toFixed(1)}%
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const { data, loading } = useApiData(
    () => searchMemories(debouncedQuery, { limit: 40 }),
    [debouncedQuery],
  );

  const results: MemorySearchResult[] = data?.results ?? [];

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
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
          Søk i semantisk minne — mønster, beslutninger og kontekst fra tidligere oppgaver.
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
              gridTemplateColumns: "1fr 120px 100px 60px 24px",
              padding: "8px 16px",
              gap: 12,
              background: T.subtle,
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            {["INNHOLD", "KILDE", "RELEVANS", "BRUK", ""].map((h, i) => (
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
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 14, color: T.textMuted }}>
                {debouncedQuery
                  ? `Ingen minner funnet for "${debouncedQuery}"`
                  : "Ingen minner lagret ennå."}
              </div>
              {debouncedQuery && (
                <div style={{ fontSize: 12, color: T.textFaint, marginTop: 6 }}>
                  Prøv et bredere søkeord.
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
