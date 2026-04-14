"use client";

import { useState, useCallback } from "react";
import { T, S } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { searchMemories, getMemoryStats } from "@/lib/api/memory";
import { apiFetch } from "@/lib/api/client";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import TabWrapper from "@/components/TabWrapper";
import StatCard from "@/components/shared/StatCard";
import EmptyState from "@/components/shared/EmptyState";

// Types
interface DreamEntry {
  id: string;
  content: string;
  tags: string[];
  category: string;
  createdAt: string;
  score?: number;
}

const TABS = [
  { id: "journal", label: "Drøm-journal" },
  { id: "insights", label: "Innsikter" },
  { id: "constellations", label: "Konstellasjoner" },
  { id: "motor", label: "Motor" },
];

function rel(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m}m siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t siden`;
  return `${Math.floor(h / 24)}d siden`;
}

const phaseColors: Record<string, string> = {
  SCAN: "#60A5FA",
  ANALYZE: "#A78BFA",
  MERGE: T.accent,
  META: T.warning,
  PRUNE: T.error,
}; // Note: SCAN and ANALYZE remain as hex since they use custom colors not in token palette

export default function DreamsPage() {
  const [tab, setTab] = useState("journal");
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  // Dream journal entries (memories tagged with dream)
  const { data: dreamData, loading: dreamLoading, refresh: refreshDreams } = useApiData(
    () => searchMemories("dream consolidation", { memoryType: "consolidation", limit: 20 }),
    []
  );

  // Dream insights
  const { data: insightsData, loading: insightsLoading } = useApiData(
    () => searchMemories("dream insight", { memoryType: "distilled", limit: 30 }),
    []
  );

  // Memory stats
  const { data: statsData } = useApiData(() => getMemoryStats(), []);

  const dreams: DreamEntry[] = (dreamData?.results ?? []).map((r: { id: string; content: string; tags?: string[]; category?: string; createdAt?: string; score?: number }) => ({
    id: r.id,
    content: r.content,
    tags: r.tags ?? [],
    category: r.category ?? "general",
    createdAt: r.createdAt ?? new Date().toISOString(),
    score: r.score,
  }));

  const insights: DreamEntry[] = (insightsData?.results ?? []).map((r: { id: string; content: string; tags?: string[]; category?: string; createdAt?: string; score?: number }) => ({
    id: r.id,
    content: r.content,
    tags: r.tags ?? [],
    category: r.category ?? "general",
    createdAt: r.createdAt ?? new Date().toISOString(),
    score: r.score,
  }));

  const handleTriggerDream = useCallback(async () => {
    setTriggerLoading(true);
    setTriggerResult(null);
    try {
      const data = await apiFetch<{ memoriesConsolidated?: number; memoriesPruned?: number }>("/memory/dream", { method: "POST" });
      setTriggerResult(`Drøm fullført: ${data.memoriesConsolidated ?? 0} konsolidert, ${data.memoriesPruned ?? 0} slettet`);
      refreshDreams();
    } catch (err) {
      setTriggerResult(`Feil: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTriggerLoading(false);
    }
  }, [refreshDreams]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.xl, paddingTop: 0, paddingBottom: S.xxl }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0 }}>Drømmer</h1>
        <p style={{ fontSize: 13, color: T.textMuted, marginTop: S.xs }}>
          TheFolds underbevissthet — konsoliderer kunnskap, oppdager mønstre, rydder opp
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: S.md }}>
        <StatCard label="Drøm-kjøringer" value={dreams.length} />
        <StatCard label="Innsikter" value={insights.length} color="success" />
        <StatCard label="Minner totalt" value={statsData?.total ?? "—"} />
        <StatCard
          label="Neste drøm"
          value="Søndag 03:00"
          color="default"
        />
      </div>

      {/* Tabs */}
      <TabWrapper tabs={TABS} active={tab} onChange={setTab} />

      {/* Tab content */}
      {tab === "journal" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
          {dreamLoading ? (
            <Skeleton rows={4} />
          ) : dreams.length === 0 ? (
            <EmptyState
              title="Ingen drømmekjøringer ennå"
              description="Drømmemotoren kjører automatisk søndag kl 03:00, eller du kan trigge den manuelt."
              action={{ label: triggerLoading ? "Drømmer..." : "La TheFold sove", onClick: handleTriggerDream }}
            />
          ) : (
            dreams.map((dream) => (
              <div
                key={dream.id}
                style={{
                  background: T.raised,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.r,
                  padding: S.md,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                    {dream.tags.filter(t => t.startsWith("phase:")).map((t) => {
                      const phase = t.replace("phase:", "").toUpperCase();
                      return (
                        <span
                          key={t}
                          style={{
                            fontSize: 10,
                            fontFamily: T.mono,
                            fontWeight: 600,
                            color: phaseColors[phase] ?? T.textMuted,
                            background: `${phaseColors[phase] ?? T.textMuted}18`,
                            padding: "2px 8px",
                            borderRadius: 4,
                          }}
                        >
                          {phase}
                        </span>
                      );
                    })}
                    <Tag variant="default">{dream.category}</Tag>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>{rel(dream.createdAt)}</span>
                </div>
                <p style={{ fontSize: 13, color: T.textSec, margin: 0, lineHeight: 1.5 }}>
                  {dream.content.length > 300 ? dream.content.slice(0, 300) + "..." : dream.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "insights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S.md }}>
          {insightsLoading ? (
            <Skeleton rows={4} />
          ) : insights.length === 0 ? (
            <EmptyState
              title="Ingen innsikter ennå"
              description="Innsikter genereres automatisk når drømmemotoren kjører."
            />
          ) : (
            insights.map((insight) => (
              <div
                key={insight.id}
                style={{
                  background: T.raised,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.r,
                  padding: S.md,
                  borderLeft: `3px solid ${T.accent}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: S.xs }}>
                  <div style={{ display: "flex", gap: S.xs }}>
                    {insight.tags.filter(t => !t.startsWith("dream-")).map((t) => (
                      <Tag key={t} variant="default">{t}</Tag>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>{rel(insight.createdAt)}</span>
                </div>
                <p style={{ fontSize: 13, color: T.textSec, margin: 0, lineHeight: 1.5 }}>
                  {insight.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "constellations" && (
        <div
          style={{
            background: T.raised,
            border: `1px solid ${T.border}`,
            borderRadius: T.r,
            padding: S.lg,
            minHeight: 400,
            position: "relative",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.sm }}>
            Minnekonstellasjoner
          </div>
          <p style={{ fontSize: 12, color: T.textMuted, marginBottom: S.md }}>
            Kraftgraf som viser minner som noder og relasjoner som kanter. Fargekoding per type.
          </p>

          {/* Legend */}
          <div style={{ display: "flex", gap: S.md, flexWrap: "wrap", marginBottom: S.md }}>
            {Object.entries({
              general: "#94A3B8",
              skill: T.success,
              task: "#60A5FA",
              session: "#A78BFA",
              error_pattern: T.error,
              decision: T.warning,
              code_pattern: "#EC4899",
            }).map(([type, color]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{type}</span>
              </div>
            ))}
          </div>

          {/* D3 constellation — placeholder with data points */}
          <div
            id="constellation-container"
            style={{
              width: "100%",
              height: 350,
              background: T.surface,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Render memory nodes as positioned dots */}
            {[...dreams, ...insights].slice(0, 30).map((entry, i) => {
              const typeColor: Record<string, string> = {
                general: "#94A3B8", skill: T.success, task: "#60A5FA",
                session: "#A78BFA", error_pattern: T.error, decision: T.warning,
                code_pattern: "#EC4899", consolidation: "#6366F1", distilled: "#F59E0B",
              };
              // Spread nodes in a circular pattern
              const angle = (i / 30) * Math.PI * 2;
              const r = 120 + Math.random() * 50;
              const cx = 50 + Math.cos(angle) * (r / 3.5);
              const cy = 50 + Math.sin(angle) * (r / 3.5);
              const size = 6 + (entry.score ?? 0.5) * 6;
              return (
                <div
                  key={entry.id}
                  title={entry.content.slice(0, 80)}
                  style={{
                    position: "absolute",
                    left: `${cx}%`,
                    top: `${cy}%`,
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: typeColor[entry.category] ?? "#94A3B8",
                    opacity: 0.7,
                    transition: "transform 0.2s, opacity 0.2s",
                    cursor: "pointer",
                    boxShadow: `0 0 ${size}px ${typeColor[entry.category] ?? "#94A3B8"}40`,
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLDivElement).style.transform = "scale(2)";
                    (e.target as HTMLDivElement).style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLDivElement).style.transform = "scale(1)";
                    (e.target as HTMLDivElement).style.opacity = "0.7";
                  }}
                />
              );
            })}

            {/* Connection lines between nearby nodes */}
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            >
              {[...dreams, ...insights].slice(0, 15).map((_, i) => {
                const angle1 = (i / 30) * Math.PI * 2;
                const angle2 = ((i + 1) / 30) * Math.PI * 2;
                const r = 120 + 25;
                const x1 = 50 + Math.cos(angle1) * (r / 3.5);
                const y1 = 50 + Math.sin(angle1) * (r / 3.5);
                const x2 = 50 + Math.cos(angle2) * (r / 3.5);
                const y2 = 50 + Math.sin(angle2) * (r / 3.5);
                return (
                  <line
                    key={i}
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke={T.border}
                    strokeWidth="0.5"
                    opacity="0.4"
                  />
                );
              })}
            </svg>

            {[...dreams, ...insights].length === 0 && (
              <span style={{ fontSize: 13, color: T.textFaint }}>
                Ingen minner å visualisere ennå
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "motor" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S.lg }}>
          <div
            style={{
              background: T.raised,
              border: `1px solid ${T.border}`,
              borderRadius: T.r,
              padding: S.lg,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Drømmemotor</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.lg }}>
              <div>
                <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S.xs }}>
                  Status
                </div>
                <div style={{ fontSize: 13, color: T.success, fontFamily: T.mono }}>Aktiv</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S.xs }}>
                  Schedule
                </div>
                <div style={{ fontSize: 13, color: T.text, fontFamily: T.mono }}>Søndag 03:00 UTC</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S.xs }}>
                  5 Faser
                </div>
                <div style={{ display: "flex", gap: S.xs, flexWrap: "wrap" }}>
                  {["SCAN", "ANALYZE", "MERGE", "META", "PRUNE"].map((phase) => (
                    <span
                      key={phase}
                      style={{
                        fontSize: 10,
                        fontFamily: T.mono,
                        fontWeight: 600,
                        color: phaseColors[phase],
                        background: `${phaseColors[phase]}18`,
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {phase}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: S.xs }}>
                  Decay-parametre
                </div>
                <div style={{ fontSize: 12, color: T.textSec, fontFamily: T.mono }}>
                  halflife=7d, min=0.1, boost=accessed
                </div>
              </div>
            </div>
            <div style={{ marginTop: S.lg, display: "flex", gap: S.sm, alignItems: "center" }}>
              <Btn variant="primary" loading={triggerLoading} onClick={handleTriggerDream}>
                La TheFold sove
              </Btn>
              {triggerResult && (
                <span style={{ fontSize: 12, color: triggerResult.startsWith("Feil") ? T.error : T.success, fontFamily: T.mono }}>
                  {triggerResult}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
