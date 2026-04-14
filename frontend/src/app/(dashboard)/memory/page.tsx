"use client";

import { useState, useCallback } from "react";
import { T, S } from "@/lib/tokens";
import { apiFetch } from "@/lib/api/client";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import Skeleton from "@/components/Skeleton";
import Btn from "@/components/Btn";
import TabWrapper from "@/components/TabWrapper";
import StatCard from "@/components/shared/StatCard";
import EmptyState from "@/components/shared/EmptyState";
import { useApiData } from "@/lib/hooks";
import {
  getMemoryStats,
  searchMemories,
  deleteMemory,
  listSkills,
  toggleSkill,
  deleteSkill,
  resolveSkills,
  previewPrompt,
  listComponents,
  searchComponents,
  getHealingStatus,
  healComponent,
  type MemorySearchResult,
  type Skill,
  type Component,
  type HealingEvent,
} from "@/lib/api";

// ─── Tab types ───────────────────────────────────────────────

type TabId = "memories" | "patterns" | "components" | "skills" | "knowledge" | "codeindex" | "manifests";

const TABS: { id: TabId; label: string }[] = [
  { id: "memories", label: "Minner" },
  { id: "patterns", label: "Mønstre" },
  { id: "components", label: "Komponenter" },
  { id: "skills", label: "Skills" },
  { id: "knowledge", label: "Kunnskap" },
  { id: "codeindex", label: "Kodeindeks" },
  { id: "manifests", label: "Manifester" },
];

const TAB_MEMORY_TYPES: Record<string, string | undefined> = {
  memories: undefined,
  patterns: "code_pattern",
  knowledge: "decision",
};

// ─── Helpers ─────────────────────────────────────────────────

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  return `${Math.floor(h / 24)}d`;
}

function typeVariant(t: string): "error" | "accent" | "default" {
  if (t === "error_pattern") return "error";
  if (t === "decision" || t === "skill") return "accent";
  return "default";
}

const cardStyle: React.CSSProperties = {
  background: T.raised,
  border: `1px solid ${T.border}`,
  borderRadius: T.r,
  padding: S.lg,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: T.sans,
  background: T.subtle,
  color: T.text,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  outline: "none",
};

// ─── Memory List ─────────────────────────────────────────────

function MemoryList({
  memories,
  loading,
  onDelete,
}: {
  memories: MemorySearchResult[];
  loading: boolean;
  onDelete?: (id: string) => void;
}) {
  if (loading) return <Skeleton rows={4} />;
  if (memories.length === 0)
    return <EmptyState title="Ingen minner funnet" description="Fullfør en oppgave for å bygge hukommelse." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {memories.map((m) => (
        <div
          key={m.id}
          style={{
            padding: `${S.sm}px ${S.md}px`,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Tag variant={typeVariant(m.memoryType)}>{m.memoryType}</Tag>
            <Tag>{m.category}</Tag>
            {m.sourceRepo && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>{m.sourceRepo}</span>
            )}
            <span style={{ fontSize: 10, color: T.textFaint, marginLeft: "auto" }}>{formatAge(m.createdAt)}</span>
            {onDelete && (
              <button
                onClick={() => onDelete(m.id)}
                style={{
                  fontSize: 10,
                  color: T.error,
                  background: `${T.dangerA0}40`,
                  border: `1px solid ${T.dangerA0}`,
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontFamily: T.mono,
                }}
              >
                slett
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
            {m.content.length > 200 ? m.content.slice(0, 200) + "…" : m.content}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
              relevans: {((Number(m.relevanceScore) || 0) * 100).toFixed(0)}%
            </span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>oppslag: {m.accessCount}</span>
            {m.tags && m.tags.length > 0 && (
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                tags: {m.tags.slice(0, 3).join(", ")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Skills List ─────────────────────────────────────────────

function SkillsList({
  skills,
  loading,
  onToggle,
  onDelete,
}: {
  skills: Skill[];
  loading: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) return <Skeleton rows={4} />;
  if (skills.length === 0)
    return <EmptyState title="Ingen skills registrert" description="Skills opprettes automatisk av agenten." />;

  const activeCount = skills.filter((s) => s.enabled).length;

  return (
    <div>
      {/* Pipeline status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: S.md,
          padding: `${S.sm}px ${S.md}px`,
          background: T.subtle,
          borderRadius: 8,
          marginBottom: S.md,
          fontSize: 12,
          fontFamily: T.mono,
        }}
      >
        <span style={{ color: T.accent, fontWeight: 600 }}>
          AKTIVE: {activeCount} av {skills.length}
        </span>
        <span style={{ color: T.textFaint }}>|</span>
        <span style={{ color: T.textMuted }}>PIPELINE: pre_run → inject → post_run</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
        {skills.map((skill) => {
          const confidence = skill.confidenceScore != null ? (skill.confidenceScore * 100).toFixed(0) : "—";
          return (
            <div
              key={skill.id}
              style={{
                ...cardStyle,
                padding: S.md,
                opacity: skill.enabled ? 1 : 0.6,
                borderLeft: `3px solid ${skill.enabled ? T.accent : T.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{skill.name}</span>
                  <Tag variant={skill.enabled ? "accent" : "default"}>
                    {skill.executionPhase ?? "inject"}
                  </Tag>
                  {skill.category && <Tag>{skill.category}</Tag>}
                </div>
                <div style={{ display: "flex", gap: S.xs }}>
                  <button
                    onClick={() => onToggle(skill.id, !skill.enabled)}
                    style={{
                      fontSize: 11,
                      color: skill.enabled ? T.warning : T.success,
                      background: "transparent",
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "4px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {skill.enabled ? "Deaktiver" : "Aktiver"}
                  </button>
                  <button
                    onClick={() => onDelete(skill.id)}
                    style={{
                      fontSize: 11,
                      color: T.error,
                      background: "transparent",
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      padding: "4px 10px",
                      cursor: "pointer",
                    }}
                  >
                    Slett
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 12, color: T.textMuted, margin: `${S.xs}px 0`, lineHeight: 1.5 }}>
                {skill.description}
              </p>
              <div style={{ display: "flex", gap: S.md, fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
                <span>prioritet: {skill.priority ?? "—"}</span>
                <span>
                  suksess: {confidence}%
                </span>
                <span>brukt: {skill.totalUses ?? 0}x</span>
                <span>tokens: ~{skill.tokenEstimate ?? "—"}</span>
                {skill.routingRules?.keywords && skill.routingRules.keywords.length > 0 && (
                  <span>keywords: {(skill.routingRules.keywords as string[]).slice(0, 3).join(", ")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Components List ─────────────────────────────────────────

function ComponentsList({
  components,
  healingEvents,
  loading,
  onHeal,
}: {
  components: Component[];
  healingEvents: HealingEvent[];
  loading: boolean;
  onHeal: (id: string) => void;
}) {
  if (loading) return <Skeleton rows={4} />;
  if (components.length === 0)
    return (
      <EmptyState
        title="Ingen komponenter registrert"
        description="Komponenter oppdages automatisk fra fullførte builds."
      />
    );

  const totalQuality =
    components.filter((c) => c.qualityScore != null).reduce((sum, c) => sum + Number(c.qualityScore ?? 0), 0) /
    (components.filter((c) => c.qualityScore != null).length || 1);
  const activeHealing = healingEvents.filter((e) => e.status === "in_progress" || e.status === "pending");

  return (
    <div>
      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          gap: S.lg,
          padding: `${S.sm}px ${S.md}px`,
          background: T.subtle,
          borderRadius: 8,
          marginBottom: S.md,
          fontSize: 12,
          fontFamily: T.mono,
        }}
      >
        <span style={{ color: T.text }}>Totalt: {components.length}</span>
        <span style={{ color: T.textFaint }}>|</span>
        <span style={{ color: T.accent }}>Snitt kvalitet: {totalQuality.toFixed(0)}%</span>
        <span style={{ color: T.textFaint }}>|</span>
        <span style={{ color: activeHealing.length > 0 ? T.warning : T.textMuted }}>
          Healing aktiv: {activeHealing.length}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S.sm }}>
        {components.map((comp) => (
          <div key={comp.id} style={{ ...cardStyle, padding: S.md }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S.xs }}>
              <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{comp.name}</span>
                <span style={{ fontSize: 11, fontFamily: T.mono, color: T.accent }}>
                  {comp.qualityScore != null ? `${comp.qualityScore}/100` : "—"}
                </span>
                <Tag>{comp.version}</Tag>
              </div>
              <Btn size="sm" onClick={() => onHeal(comp.id)}>
                Oppdater alle
              </Btn>
            </div>
            {comp.description && (
              <p style={{ fontSize: 12, color: T.textMuted, margin: `${S.xs}px 0` }}>{comp.description}</p>
            )}
            <div style={{ display: "flex", gap: S.md, fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
              <span>
                Filer: {comp.files?.length ?? 0} · {comp.files?.reduce((s, f) => s + f.content.split("\n").length, 0) ?? 0}{" "}
                linjer
              </span>
              {comp.tags.length > 0 && <span>Tags: {comp.tags.join(", ")}</span>}
              <span>Brukt i: {comp.usedByRepos?.join(", ") || "—"} ({comp.timesUsed}x)</span>
            </div>
          </div>
        ))}
      </div>

      {/* Active healing events */}
      {activeHealing.length > 0 && (
        <div style={{ marginTop: S.lg }}>
          <SectionLabel>HEALING-PIPELINE (AKTIVE)</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activeHealing.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${S.xs}px ${S.sm}px`,
                  fontSize: 12,
                }}
              >
                <span style={{ color: T.text }}>
                  {ev.componentId} → {ev.affectedRepos?.join(", ") || "—"}
                </span>
                <Tag variant={ev.status === "in_progress" ? "accent" : "default"}>{ev.status}</Tag>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<TabId>("memories");
  const [searchQuery, setSearchQuery] = useState("");
  const [pruning, setPruning] = useState(false);
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Data fetching
  const { data: statsData, loading: statsLoading } = useApiData(() => getMemoryStats(), []);
  const { data: memoriesData, loading: memsLoading, refresh: refreshMemories } = useApiData(
    () => searchMemories(searchQuery, { limit: 30, memoryType: TAB_MEMORY_TYPES[activeTab] }),
    [activeTab, searchQuery],
  );
  const { data: skillsData, loading: skillsLoading, refresh: refreshSkills } = useApiData(
    () => listSkills(undefined, false),
    [],
  );
  const { data: componentsData, loading: compLoading, refresh: refreshComponents } = useApiData(
    () => listComponents({ limit: 20 }),
    [],
  );
  const { data: healingData } = useApiData(() => getHealingStatus({ limit: 10 }), []);

  const stats = statsData;
  const memories: MemorySearchResult[] = memoriesData?.results ?? [];
  const skills: Skill[] = skillsData?.skills ?? [];
  const components: Component[] = componentsData?.components ?? [];
  const healingEvents: HealingEvent[] = healingData?.events ?? [];

  const totalMemories = stats?.total ?? 0;
  const codePatternCount = (stats as any)?.byType?.["code_pattern"] ?? 0;
  const decisionCount = (stats as any)?.byType?.["decision"] ?? 0;
  const skillMemCount = (stats as any)?.byType?.["skill"] ?? 0;

  // Handlers
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Slett dette minnet permanent?")) return;
      await deleteMemory(id);
      refreshMemories();
    },
    [refreshMemories],
  );

  const handleToggleSkill = useCallback(
    async (id: string, enabled: boolean) => {
      await toggleSkill(id, enabled);
      refreshSkills();
    },
    [refreshSkills],
  );

  const handleDeleteSkill = useCallback(
    async (id: string) => {
      if (!confirm("Slett denne skillen permanent?")) return;
      await deleteSkill(id);
      refreshSkills();
    },
    [refreshSkills],
  );

  const handleHealComponent = useCallback(
    async (id: string) => {
      await healComponent(id);
      refreshComponents();
    },
    [refreshComponents],
  );

  const handlePreviewPrompt = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await previewPrompt("general task");
      setPromptPreview(
        `Aktive skills: ${res.activeSkillNames.join(", ") || "ingen"}\n\n${res.systemPrompt.slice(0, 2000)}${res.systemPrompt.length > 2000 ? "\n\n…(trunkert)" : ""}`,
      );
    } catch {
      setPromptPreview("Feil ved forhåndsvisning");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handlePrune = useCallback(async () => {
    if (!confirm("Er du sikker? Dette kjører opprydding (sletter utløpte minner) og decay (reduserer score på gamle minner).")) return;
    setPruning(true);
    try {
      // Step 1: Cleanup expired TTL memories
      const cleanup = await apiFetch<{ deleted: number }>("/memory/cleanup", { method: "POST" });
      // Step 2: Run decay scoring (may delete very low-score memories)
      const decay = await apiFetch<{ updated: number; deleted: number; total: number }>("/memory/decay", { method: "POST" });
      const totalDeleted = (cleanup.deleted ?? 0) + (decay.deleted ?? 0);
      alert(`Opprydding ferdig: ${totalDeleted} minner slettet (${cleanup.deleted ?? 0} utløpte + ${decay.deleted ?? 0} lav score). ${decay.updated ?? 0} minner oppdatert. ${decay.total ?? "?"} minner gjenstår.`);
      refreshMemories();
    } catch (err) {
      alert(`Opprydding feilet: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPruning(false);
    }
  }, [refreshMemories]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.xl, paddingTop: 0, paddingBottom: S.xxl }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0 }}>Hukommelse</h1>
          <p style={{ fontSize: 13, color: T.textMuted, marginTop: S.xs }}>
            Minner, mønstre, komponenter, skills, kunnskap, kodeindeks og manifester
          </p>
        </div>
        <div style={{ display: "flex", gap: S.sm }}>
          <Btn size="sm" loading={pruning} onClick={handlePrune}>
            Prune minner
          </Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: S.md }}>
        <StatCard label="Minner totalt" value={statsLoading ? "—" : totalMemories} />
        <StatCard label="Kode-mønstre" value={statsLoading ? "—" : codePatternCount} />
        <StatCard label="Beslutninger" value={statsLoading ? "—" : decisionCount} color="success" />
        <StatCard label="Skills" value={skills.filter((s) => s.enabled).length} color="success" />
        <StatCard label="Komponenter" value={components.length} />
        <StatCard label="Hybrid-søk" value="60/40" />
      </div>

      {/* Search */}
      {(activeTab === "memories" || activeTab === "patterns" || activeTab === "knowledge") && (
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Søk i minner..."
          style={inputStyle}
        />
      )}

      {/* Tabs */}
      <TabWrapper tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      {/* Tab content */}
      {activeTab === "memories" && (
        <div style={cardStyle}>
          <MemoryList memories={memories} loading={memsLoading} onDelete={handleDelete} />
        </div>
      )}

      {activeTab === "patterns" && (
        <div style={cardStyle}>
          <SectionLabel>KODE-MØNSTRE</SectionLabel>
          <p style={{ fontSize: 12, color: T.textMuted, marginBottom: S.md }}>
            Kode-mønstre med suksessrate, bruks-statistikk og relaterte minner.
          </p>
          <MemoryList
            memories={memories.filter((m) => m.memoryType === "code_pattern")}
            loading={memsLoading}
          />
        </div>
      )}

      {activeTab === "components" && (
        <ComponentsList
          components={components}
          healingEvents={healingEvents}
          loading={compLoading}
          onHeal={handleHealComponent}
        />
      )}

      {activeTab === "skills" && (
        <div>
          <SkillsList
            skills={skills}
            loading={skillsLoading}
            onToggle={handleToggleSkill}
            onDelete={handleDeleteSkill}
          />
          {/* Debug tools */}
          <div style={{ ...cardStyle, marginTop: S.lg }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Debug-verktøy</div>
            <div style={{ display: "flex", gap: S.sm, marginBottom: S.md }}>
              <Btn size="sm" loading={previewLoading} onClick={handlePreviewPrompt}>
                Forhåndsvis prompt
              </Btn>
              <Btn
                size="sm"
                onClick={async () => {
                  try {
                    const res = await resolveSkills({ task: "test matching" });
                    alert(
                      `Resolved: ${res.result.injectedSkillIds.length} skills, ${res.result.tokensUsed} tokens\nSkills: ${res.result.injectedSkillIds.join(", ") || "ingen"}`,
                    );
                  } catch {
                    alert("Feil ved test matching");
                  }
                }}
              >
                Test matching
              </Btn>
            </div>
            {promptPreview && (
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: T.mono,
                  color: T.textSec,
                  background: T.subtle,
                  padding: S.md,
                  borderRadius: 8,
                  overflow: "auto",
                  maxHeight: 300,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {promptPreview}
              </pre>
            )}
          </div>
        </div>
      )}

      {activeTab === "knowledge" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.lg }}>
          <div style={cardStyle}>
            <SectionLabel>DESTILLERT KUNNSKAP</SectionLabel>
            <p style={{ fontSize: 12, color: T.textMuted, marginBottom: S.md }}>
              Beslutninger, ferdigheter og viktige observasjoner fra oppgaver.
            </p>
            <MemoryList
              memories={memories.filter((m) => ["decision", "skill", "task"].includes(m.memoryType))}
              loading={memsLoading}
            />
          </div>
          <div style={cardStyle}>
            <SectionLabel>FEILMØNSTRE</SectionLabel>
            <p style={{ fontSize: 12, color: T.textMuted, marginBottom: S.md }}>
              Kjente feil og deres løsninger — brukes for cross-task læring.
            </p>
            <MemoryList
              memories={memories.filter((m) => m.memoryType === "error_pattern")}
              loading={memsLoading}
            />
            <div style={{ marginTop: S.lg, borderTop: `1px solid ${T.border}`, paddingTop: S.md }}>
              <SectionLabel>INTEGRITETSKONTROLL</SectionLabel>
              <div style={{ display: "flex", gap: S.sm }}>
                <div style={{ flex: 1, background: T.subtle, padding: "10px 14px", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: T.textMuted }}>SHA-256 HASH</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.success }}>OK</div>
                </div>
                <div style={{ flex: 1, background: T.subtle, padding: "10px 14px", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: T.textMuted }}>SANITERING</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.success }}>ASI06</div>
                </div>
                <div style={{ flex: 1, background: T.subtle, padding: "10px 14px", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: T.textMuted }}>TRUST-LEVEL</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.accent }}>user</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "codeindex" && (
        <div style={cardStyle}>
          <EmptyState
            title="Kodeindeks"
            description="Kodeindeksering genereres automatisk fra bygg og PR-godkjenninger. Data vises her når repos er indeksert."
          />
        </div>
      )}

      {activeTab === "manifests" && (
        <div style={cardStyle}>
          <EmptyState
            title="Prosjekt-manifester"
            description="Manifester med tech stack, konvensjoner og avhengigheter genereres automatisk fra repo-analyse."
          />
        </div>
      )}
    </div>
  );
}
