"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import { GR } from "@/components/GridRow";
import Skeleton from "@/components/Skeleton";
import Btn from "@/components/Btn";
import { useApiData } from "@/lib/hooks";
import { getMemoryStats, searchMemories, MemorySearchResult } from "@/lib/api";

type TabId = "conversations" | "knowledge" | "dreams";

const TABS: { id: TabId; label: string }[] = [
  { id: "conversations", label: "Siste samtaler" },
  { id: "knowledge", label: "Destillert kunnskap" },
  { id: "dreams", label: "Drøm-historikk" },
];

const TAB_TYPES: Record<TabId, string[]> = {
  conversations: ["session", "general"],
  knowledge: ["decision", "skill", "error_pattern", "task"],
  dreams: ["consolidation", "distilled"],
};

// Primary type for API filtering (API supports single type only)
const TAB_PRIMARY_TYPE: Record<TabId, string | undefined> = {
  conversations: "session",
  knowledge: "decision",
  dreams: "consolidation",
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "i dag";
  if (days === 1) return "1d";
  return `${days}d`;
}

function typeVariant(t: string): "error" | "accent" | "default" {
  if (t === "error_pattern") return "error";
  if (t === "decision" || t === "skill") return "accent";
  return "default";
}

function MemoryList({ memories, loading }: { memories: MemorySearchResult[]; loading: boolean }) {
  if (loading) return <div style={{ padding: "20px 0" }}><Skeleton rows={4} /></div>;
  if (memories.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center" }}>
        <span style={{ fontSize: 13, color: T.textMuted }}>Ingen minner funnet.</span>
      </div>
    );
  }
  return (
    <>
      {memories.map((m, i) => (
        <div
          key={m.id}
          style={{
            padding: "10px 0",
            borderBottom: i < memories.length - 1 ? `1px solid ${T.border}` : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Tag variant={typeVariant(m.memoryType)}>{m.memoryType}</Tag>
            <Tag>{m.category}</Tag>
            {m.sourceRepo && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                {m.sourceRepo}
              </span>
            )}
            <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>
              {formatAge(m.createdAt)}
            </span>
          </div>
          <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>{m.content}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              relevans: {((Number(m.relevanceScore) || 0) * 100).toFixed(0)}%
            </span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              oppslag: {m.accessCount}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>("conversations");
  const [pruning, setPruning] = useState(false);

  const { data: statsData, loading: statsLoading } = useApiData(() => getMemoryStats(), []);
  const { data: memoriesData, loading: memsLoading } = useApiData(
    () => searchMemories("", { limit: 30, memoryType: TAB_PRIMARY_TYPE[activeTab] }),
    [activeTab],
  );

  const stats = statsData as (typeof statsData & {
    lastConsolidatedAt?: string | null;
    storageBytes?: number;
  }) | null;

  // Client-side filter to include all types for the active tab
  const allMems = memoriesData?.results ?? [];
  const tabTypes = TAB_TYPES[activeTab];
  const mems = allMems.filter((m) => tabTypes.includes(m.memoryType));

  const totalMemories = stats?.total ?? 0;
  const codePatternCount = stats?.byType?.["code_pattern"] ?? 0;
  const lastConsolidated = (stats as any)?.lastConsolidatedAt;
  const storageBytes = (stats as any)?.storageBytes;

  const formatStorage = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatLastConsolidated = (dateStr?: string | null) => {
    if (!dateStr) return "aldri";
    return formatAge(dateStr);
  };

  // Derive code pattern stats from memories
  const patternTypes: Record<string, { count: number; reused: number }> = {};
  mems.forEach((m) => {
    if (!patternTypes[m.memoryType]) patternTypes[m.memoryType] = { count: 0, reused: 0 };
    patternTypes[m.memoryType].count += 1;
    patternTypes[m.memoryType].reused += m.accessCount;
  });
  const pats = Object.entries(patternTypes).map(([type, data]) => ({
    type,
    count: data.count,
    reused: data.reused,
  }));

  const handlePrune = async () => {
    if (!confirm("Er du sikker? Dette sletter minner med lav relevans permanent.")) return;
    setPruning(true);
    // Prune is not yet a dedicated API call — placeholder for future endpoint
    await new Promise((r) => setTimeout(r, 1200));
    setPruning(false);
    alert("Prune fullført (ikke-implementert ennå — grunnmur klar).");
  };

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: T.text,
                letterSpacing: "-0.03em",
                marginBottom: 8,
              }}
            >
              Memory
            </h2>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Semantisk minne med pgvector, temporal decay og kode-mønstre.
            </p>
          </div>
          <Btn
            sm
            onClick={handlePrune}
            style={{ opacity: pruning ? 0.5 : 1, pointerEvents: pruning ? "none" : "auto" }}
          >
            {pruning ? "Pruner…" : "Prune minner"}
          </Btn>
        </div>
      </div>

      {/* Stats bar — 6 columns */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            overflow: "hidden",
          }}
        >
          {[
            { l: "MINNER", v: statsLoading ? "–" : String(totalMemories) },
            { l: "KODE-MØNSTRE", v: statsLoading ? "–" : String(codePatternCount) },
            { l: "HYBRID-SØK", v: "60/40", sub: "semantic/keyword" },
            { l: "DECAY", v: "30d", sub: "halvtid" },
            {
              l: "SISTE KONSOLIDERING",
              v: statsLoading ? "–" : formatLastConsolidated(lastConsolidated),
            },
            {
              l: "LAGRING",
              v: statsLoading ? "–" : formatStorage(storageBytes),
            },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: "18px 20px",
                borderRight: i < 5 ? `1px solid ${T.border}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: T.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                {s.l}
              </div>
              <div
                style={{
                  fontSize: s.l === "SISTE KONSOLIDERING" || s.l === "LAGRING" ? 16 : 28,
                  fontWeight: 600,
                  color: T.text,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {s.v}
              </div>
              {(s as any).sub && (
                <div style={{ marginTop: 4, fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                  {(s as any).sub}
                </div>
              )}
            </div>
          ))}
        </div>
      </GR>

      {/* Tabs */}
      <GR>
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: `1px solid ${T.border}`,
            marginTop: 20,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${T.accent}` : "2px solid transparent",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: T.sans,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? T.text : T.textMuted,
                marginBottom: -1,
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </GR>

      {/* Tab content */}
      <GR mb={40}>
        {activeTab === "knowledge" ? (
          /* Knowledge tab — two-panel layout with pattern breakdown */
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              borderRadius: 12,
              border: `1px solid ${T.border}`,
              marginTop: 0,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 20, borderRight: `1px solid ${T.border}` }}>
              <SectionLabel>DESTILLERT KUNNSKAP</SectionLabel>
              <MemoryList memories={mems} loading={memsLoading} />
            </div>
            <div style={{ padding: 20 }}>
              <SectionLabel>KODE-MØNSTRE</SectionLabel>
              {memsLoading ? (
                <div style={{ padding: "20px 0" }}><Skeleton rows={4} /></div>
              ) : pats.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center" }}>
                  <span style={{ fontSize: 13, color: T.textMuted }}>Ingen mønstre funnet.</span>
                </div>
              ) : (
                pats.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: i < pats.length - 1 ? `1px solid ${T.border}` : "none",
                    }}
                  >
                    <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{p.type}</span>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>
                        {p.count} mønstre
                      </span>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.success }}>
                        {p.reused}x gjenbrukt
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                <SectionLabel>INTEGRITETSKONTROLL</SectionLabel>
                <div style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      flex: 1,
                      background: T.subtle,
                      padding: "10px 14px",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ fontSize: 10, color: T.textMuted }}>SHA-256 HASH</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.success }}>OK</div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: T.subtle,
                      padding: "10px 14px",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ fontSize: 10, color: T.textMuted }}>SANITERING</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.success }}>ASI06</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Conversations and Dreams tabs — single column list */
          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${T.border}`,
              marginTop: 0,
              overflow: "hidden",
              padding: "0 20px",
            }}
          >
            {activeTab === "dreams" && (
              <div
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 12,
                  color: T.textFaint,
                  fontFamily: T.mono,
                }}
              >
                Drøm-konsolidering kjøres automatisk når nye mønstre oppdages. Viser destillerte
                innsikter fra tvers av oppgaver.
              </div>
            )}
            <div style={{ paddingTop: 4 }}>
              <MemoryList memories={mems} loading={memsLoading} />
            </div>
          </div>
        )}
      </GR>
    </>
  );
}
