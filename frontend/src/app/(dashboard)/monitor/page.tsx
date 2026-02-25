"use client";

import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import SectionLabel from "@/components/SectionLabel";
import PixelCorners from "@/components/PixelCorners";
import { GR } from "@/components/GridRow";
import { useApiData } from "@/lib/hooks";
import { getMonitorHealth, getHealingStatus } from "@/lib/api";

function extractDetail(details: Record<string, unknown>): string {
  if (typeof details === "string") return details;
  if (details.message && typeof details.message === "string") return details.message;
  if (details.detail && typeof details.detail === "string") return details.detail;
  if (details.summary && typeof details.summary === "string") return details.summary;
  const keys = Object.keys(details);
  if (keys.length === 0) return "\u2014";
  // Build a readable string from first few keys
  return keys.slice(0, 3).map(k => `${k}: ${String(details[k])}`).join(", ");
}

export default function MonitorPage() {
  const { data: healthData, loading: healthLoading } = useApiData(() => getMonitorHealth(), []);
  const { data: healingData, loading: healingLoading } = useApiData(() => getHealingStatus({ limit: 10 }), []);

  // Flatten health checks from repos map
  const checks: Array<{ repo: string; type: string; status: "pass" | "warn" | "fail"; detail: string; time: string }> = [];
  if (healthData?.repos) {
    for (const [repoName, repoChecks] of Object.entries(healthData.repos)) {
      for (const check of repoChecks) {
        checks.push({
          repo: check.repo || repoName,
          type: check.checkType,
          status: check.status,
          detail: extractDetail(check.details),
          time: check.createdAt ? new Date(check.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : "\u2014",
        });
      }
    }
  }

  const healingEvents = healingData?.events ?? [];

  const loading = healthLoading || healingLoading;

  const passCount = checks.filter(c => c.status === "pass").length;
  const warnCount = checks.filter(c => c.status === "warn").length;
  const failCount = checks.filter(c => c.status === "fail").length;

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", fontFamily: T.brandFont, marginBottom: 8 }}>Monitor & Metrics</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Repo helse-sjekker, healing-pipeline og systemstatus.</p>
      </div>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", border: `1px solid ${T.border}`, borderRadius: T.r, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          {[
            { l: "HELSE-SJEKKER", v: loading ? "\u2013" : checks.length },
            { l: "BEST\u00c5TT", v: loading ? "\u2013" : passCount, c: T.success },
            { l: "ADVARSLER", v: loading ? "\u2013" : warnCount, c: T.warning },
            { l: "FEILET", v: loading ? "\u2013" : failCount, c: T.error },
          ].map((s, i) => (
            <div key={i} style={{ padding: "18px 20px", borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.l}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: s.c || T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </GR>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: `0 0 ${T.r}px ${T.r}px`, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          <div style={{ padding: 20, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>HELSE-SJEKKER</SectionLabel>
            {healthLoading ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Laster helse-sjekker...</span>
              </div>
            ) : checks.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen helse-sjekker funnet.</span>
              </div>
            ) : (
              checks.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < checks.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.status === "pass" ? T.success : c.status === "warn" ? T.warning : T.error }} />
                  <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint, width: 140 }}>{c.repo}</span>
                  <span style={{ fontSize: 12, color: T.textSec, flex: 1 }}>{c.type}</span>
                  <span style={{ fontSize: 11, color: T.textMuted }}>{c.detail}</span>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: 20 }}>
            <SectionLabel>HEALING PIPELINE</SectionLabel>
            {healingLoading ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Laster healing-data...</span>
              </div>
            ) : healingEvents.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen healing-hendelser.</span>
              </div>
            ) : (
              healingEvents.map((h, i) => {
                const severityScore = h.severity === "critical" ? 30 : h.severity === "high" ? 55 : h.severity === "medium" ? 75 : 92;
                return (
                  <div key={h.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: T.textSec }}>{h.componentId}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Tag variant={h.status === "completed" ? "accent" : h.status === "pending" ? "default" : "error"}>{h.status}</Tag>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: severityScore >= 80 ? T.success : severityScore >= 60 ? T.warning : T.error }}>{severityScore}/100</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: T.subtle, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${severityScore}%`, height: "100%", background: severityScore >= 80 ? T.success : severityScore >= 60 ? T.warning : T.error }} />
                    </div>
                  </div>
                );
              })
            )}
            <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>SISTE KJ\u00d8RING</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{checks.length > 0 ? checks[0].time : "\u2014"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>NESTE</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>daglig 03:00</div>
                </div>
                <Btn sm primary onClick={() => alert("Funksjon ikke tilgjengelig \u2014 monitor kj\u00f8rer som cron-jobb.")}>Kj\u00f8r n\u00e5</Btn>
              </div>
            </div>
          </div>
        </div>
      </GR>

      <GR mb={40}><div style={{ height: 1 }} /></GR>
    </>
  );
}
