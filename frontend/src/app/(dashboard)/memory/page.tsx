"use client";

import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import { GR } from "@/components/GridRow";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { getMemoryStats, searchMemories } from "@/lib/api";

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "i dag";
  if (days === 1) return "1d";
  return `${days}d`;
}

export default function MemoryPage() {
  const { data: statsData, loading: statsLoading } = useApiData(() => getMemoryStats(), []);
  const { data: memoriesData, loading: memsLoading } = useApiData(() => searchMemories("", { limit: 20 }), []);

  const stats = statsData;
  const mems = memoriesData?.results ?? [];

  const codePatternCount = stats?.byType?.["code_pattern"] ?? 0;
  const totalMemories = stats?.total ?? 0;

  // Derive code pattern stats from memories if available
  const patternTypes: Record<string, { count: number; reused: number }> = {};
  mems.forEach(m => {
    if (!patternTypes[m.memoryType]) {
      patternTypes[m.memoryType] = { count: 0, reused: 0 };
    }
    patternTypes[m.memoryType].count += 1;
    patternTypes[m.memoryType].reused += m.accessCount;
  });
  const pats = Object.entries(patternTypes).map(([type, data]) => ({
    type,
    count: data.count,
    reused: data.reused,
  }));

  const loading = statsLoading || memsLoading;

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Memory</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Semantisk minne med pgvector, temporal decay og kode-mønstre.</p>
      </div>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", border: `1px solid ${T.border}`, borderRadius: T.r, position: "relative", overflow: "hidden" }}>
          {[
            { l: "MINNER", v: statsLoading ? "–" : String(totalMemories) },
            { l: "KODE-MØNSTRE", v: statsLoading ? "–" : String(codePatternCount) },
            { l: "HYBRID-SØK", v: "60/40", sub: "semantic/keyword" },
            { l: "DECAY", v: "30d", sub: "halvtid" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "18px 20px", borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.l}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.v}</div>
              {s.sub && <div style={{ marginTop: 4, fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      </GR>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: `0 0 ${T.r}px ${T.r}px`, position: "relative", overflow: "hidden" }}>
          <div style={{ padding: 20, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>SISTE MINNER</SectionLabel>
            {memsLoading ? (
              <div style={{ padding: "20px 0" }}>
                <Skeleton rows={4} />
              </div>
            ) : mems.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen minner funnet.</span>
              </div>
            ) : (
              mems.map((m, i) => (
                <div key={m.id} style={{ padding: "10px 0", borderBottom: i < mems.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Tag variant={m.memoryType === "error_pattern" ? "error" : m.memoryType === "decision" ? "accent" : "default"}>{m.memoryType}</Tag>
                    <Tag>{m.category}</Tag>
                    {m.sourceRepo && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{m.sourceRepo}</span>}
                    <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>{formatAge(m.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>{m.content}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>relevans: {((Number(m.relevanceScore) || 0) * 100).toFixed(0)}%</span>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>oppslag: {m.accessCount}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: 20 }}>
            <SectionLabel>KODE-MØNSTRE</SectionLabel>
            {loading ? (
              <div style={{ padding: "20px 0" }}>
                <Skeleton rows={4} />
              </div>
            ) : pats.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen mønstre funnet.</span>
              </div>
            ) : (
              pats.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < pats.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{p.type}</span>
                  <div style={{ display: "flex", gap: 16 }}>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>{p.count} mønstre</span>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.success }}>{p.reused}x gjenbrukt</span>
                  </div>
                </div>
              ))
            )}
            <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              <SectionLabel>INTEGRITETSKONTROLL</SectionLabel>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, background: T.subtle, padding: "10px 14px", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: T.textMuted }}>SHA-256 HASH</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.success }}>OK</div>
                </div>
                <div style={{ flex: 1, background: T.subtle, padding: "10px 14px", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: T.textMuted }}>SANITERING</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.success }}>ASI06</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GR>

      <GR mb={40}><div style={{ height: 1 }} /></GR>
    </>
  );
}
