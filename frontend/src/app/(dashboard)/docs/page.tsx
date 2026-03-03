"use client";

import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import SectionLabel from "@/components/SectionLabel";
import { GR } from "@/components/GridRow";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { getHealingStatus, getMonitorHealth } from "@/lib/api";

function extractDetail(details: Record<string, unknown>): string {
  if (typeof details === "string") return details;
  if (details.message && typeof details.message === "string") return details.message;
  if (details.detail && typeof details.detail === "string") return details.detail;
  if (details.summary && typeof details.summary === "string") return details.summary;
  const keys = Object.keys(details);
  if (keys.length === 0) return "\u2014";
  return keys.slice(0, 3).map(k => `${k}: ${String(details[k])}`).join(", ");
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" })
      + " " + d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "\u2014";
  }
}

export default function DocsPage() {
  const { data: healingData, loading: healingLoading } = useApiData(() => getHealingStatus({ limit: 20 }), []);
  const { data: healthData, loading: healthLoading } = useApiData(() => getMonitorHealth(), []);

  const healingEvents = healingData?.events ?? [];

  // Flatten health checks
  const checks: Array<{ repo: string; type: string; status: string; detail: string; date: string }> = [];
  if (healthData?.repos) {
    for (const [repoName, repoChecks] of Object.entries(healthData.repos)) {
      for (const check of repoChecks) {
        checks.push({
          repo: check.repo || repoName,
          type: check.checkType,
          status: check.status,
          detail: extractDetail(check.details),
          date: check.createdAt ? formatDate(check.createdAt) : "\u2014",
        });
      }
    }
  }

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Docs</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Healing-rapporter og helse-sjekker fra systemet.</p>
      </div>

      {/* Healing-rapporter */}
      <GR>
        <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, position: "relative", overflow: "hidden" }}>
          <div style={{ padding: 20 }}>
            <SectionLabel>HEALING-RAPPORTER</SectionLabel>
            {healingLoading ? (
              <div style={{ padding: "20px 0" }}>
                <Skeleton rows={4} />
              </div>
            ) : healingEvents.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen healing-rapporter funnet.</span>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px 80px 2fr", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>DATO</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>KOMPONENT</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>TRIGGER</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>STATUS</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>DETALJER</span>
                </div>
                {healingEvents.map((h, i) => (
                  <div key={h.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px 80px 2fr", padding: "8px 0", borderBottom: i < healingEvents.length - 1 ? `1px solid ${T.border}` : "none", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
                      {formatDate(h.createdAt)}
                    </span>
                    <span style={{ fontSize: 12, color: T.textSec }}>{h.componentId}</span>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>{h.trigger}</span>
                    <Tag variant={h.status === "completed" ? "success" : h.status === "pending" ? "default" : "error"}>{h.status}</Tag>
                    <span style={{ fontSize: 11, color: T.textMuted }}>
                      {h.severity} &mdash; {h.affectedRepos.length} repos, {h.tasksCreated.length} tasks
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </GR>

      {/* Helse-sjekker */}
      <GR mb={40}>
        <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, marginTop: 20, position: "relative", overflow: "hidden" }}>
          <div style={{ padding: 20 }}>
            <SectionLabel>HELSE-SJEKKER</SectionLabel>
            {healthLoading ? (
              <div style={{ padding: "20px 0" }}>
                <Skeleton rows={4} />
              </div>
            ) : checks.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen helse-sjekker funnet.</span>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "120px 140px 1fr 80px 2fr", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>DATO</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>REPO</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>TYPE</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>STATUS</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>DETALJER</span>
                </div>
                {checks.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 140px 1fr 80px 2fr", padding: "8px 0", borderBottom: i < checks.length - 1 ? `1px solid ${T.border}` : "none", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>{c.date}</span>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>{c.repo}</span>
                    <span style={{ fontSize: 12, color: T.textSec }}>{c.type}</span>
                    <Tag variant={c.status === "pass" ? "success" : c.status === "warn" ? "default" : "error"}>{c.status}</Tag>
                    <span style={{ fontSize: 11, color: T.textMuted }}>{c.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </GR>
    </>
  );
}
