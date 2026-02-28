"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import SectionLabel from "@/components/SectionLabel";
import PixelCorners from "@/components/PixelCorners";
import { GR } from "@/components/GridRow";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { getMonitorHealth, getHealingStatus, listRepos, runMonitorCheck, getMonitorHistory } from "@/lib/api";

function extractDetail(details: Record<string, unknown>): string {
  if (typeof details === "string") return details;
  if (details.message && typeof details.message === "string") return details.message;
  if (details.detail && typeof details.detail === "string") return details.detail;
  if (details.summary && typeof details.summary === "string") return details.summary;
  const keys = Object.keys(details);
  if (keys.length === 0) return "\u2014";
  return keys.slice(0, 3).map(k => `${k}: ${String(details[k])}`).join(", ");
}

export default function MonitorPage() {
  const { data: healthData, loading: healthLoading } = useApiData(() => getMonitorHealth(), []);
  const { data: healingData, loading: healingLoading } = useApiData(() => getHealingStatus({ limit: 10 }), []);
  const { data: reposData, loading: reposLoading } = useApiData(() => listRepos("thefold-dev"), []);

  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<Array<{ repo: string; checkType: string; status: string; details: Record<string, unknown> }> | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; repo: string; checkType: string; status: string; details: Record<string, unknown>; createdAt: string }> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const repos = reposData?.repos ?? [];

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

  const handleRunCheck = async () => {
    if (!selectedRepo) return;
    setRunning(true);
    setRunResults(null);
    try {
      const res = await runMonitorCheck(selectedRepo);
      setRunResults(res.results);
      // Also fetch history for this repo
      setHistoryLoading(true);
      try {
        const hist = await getMonitorHistory(selectedRepo, 20);
        setHistory(hist.checks);
      } catch {
        setHistory(null);
      } finally {
        setHistoryLoading(false);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Feil ved kjoring");
    } finally {
      setRunning(false);
    }
  };

  const handleFetchHistory = async () => {
    if (!selectedRepo) return;
    setHistoryLoading(true);
    try {
      const hist = await getMonitorHistory(selectedRepo, 20);
      setHistory(hist.checks);
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Monitor & Metrics</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Repo helse-sjekker, healing-pipeline og systemstatus.</p>
      </div>

      {/* Automated checks info */}
      <GR>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          <div style={{ padding: 20 }}>
            <SectionLabel>AUTOMATISKE SJEKKER</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
              <div style={{ background: T.subtle, padding: "14px 18px", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 4 }}>Daglig kl 03:00 &mdash; Repo-helsesjekk</div>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
                  Kj&oslash;rer dependency_audit og test_coverage p&aring; alle registrerte repos. Resultater lagres i monitor-historikk.
                </div>
              </div>
              <div style={{ background: T.subtle, padding: "14px 18px", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 4 }}>Fredag kl 03:00 &mdash; Self-healing</div>
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
                  Analyserer kvalitetsm&aring;l og utl&oslash;ser automatisk healing-pipeline for komponenter med lav score.
                </div>
              </div>
            </div>
          </div>
        </div>
      </GR>

      {/* Stats bar */}
      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: 0, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          {[
            { l: "HELSE-SJEKKER", v: loading ? "\u2013" : checks.length },
            { l: "BEST\u00C5TT", v: loading ? "\u2013" : passCount, c: T.success },
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: 0, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          <div style={{ padding: 20, borderRight: `1px solid ${T.border}` }}>
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
              <div style={{ padding: "20px 0" }}>
                <Skeleton rows={4} />
              </div>
            ) : healingEvents.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <span style={{ fontSize: 13, color: T.textMuted }}>Ingen healing-hendelser.</span>
              </div>
            ) : (
              healingEvents.map((h) => {
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
                  <div style={{ fontSize: 10, color: T.textMuted }}>SISTE KJ&Oslash;RING</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{checks.length > 0 ? checks[0].time : "\u2014"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>NESTE</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>daglig 03:00</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GR>

      {/* Run check section with repo selector */}
      <GR>
        <div style={{ border: `1px solid ${T.border}`, borderTop: "none", borderRadius: 0, position: "relative", overflow: "hidden" }}>
          <PixelCorners />
          <div style={{ padding: 20 }}>
            <SectionLabel>KJ&Oslash;R SJEKK</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <select
                value={selectedRepo}
                onChange={(e) => {
                  setSelectedRepo(e.target.value);
                  setRunResults(null);
                  setHistory(null);
                }}
                style={{
                  background: T.subtle,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: T.text,
                  fontFamily: T.mono,
                  outline: "none",
                  minWidth: 240,
                  appearance: "none" as const,
                  WebkitAppearance: "none" as const,
                  cursor: "pointer",
                }}
              >
                <option value="" style={{ background: T.bg, color: T.textMuted }}>
                  {reposLoading ? "Laster repos..." : "Velg repo..."}
                </option>
                {repos.map((r) => (
                  <option key={r.name} value={r.name} style={{ background: T.bg, color: T.text }}>
                    {r.name}
                  </option>
                ))}
              </select>
              <Btn sm primary onClick={handleRunCheck} style={{ opacity: running || !selectedRepo ? 0.5 : 1, pointerEvents: running || !selectedRepo ? "none" : "auto" }}>
                {running ? "Kj\u00F8rer..." : "Kj\u00F8r n\u00E5"}
              </Btn>
              {selectedRepo && (
                <Btn sm onClick={handleFetchHistory} style={{ opacity: historyLoading ? 0.5 : 1 }}>
                  Vis historikk
                </Btn>
              )}
            </div>

            {/* Run results */}
            {runResults && (
              <div style={{ marginTop: 16 }}>
                <SectionLabel>RESULTATER</SectionLabel>
                {runResults.length === 0 ? (
                  <div style={{ fontSize: 12, color: T.textMuted }}>Ingen resultater.</div>
                ) : (
                  runResults.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < runResults.length - 1 ? `1px solid ${T.border}` : "none" }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: r.status === "pass" ? T.success : r.status === "warn" ? T.warning : T.error,
                      }} />
                      <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textFaint, width: 140 }}>{r.repo}</span>
                      <span style={{ fontSize: 12, color: T.textSec, flex: 1 }}>{r.checkType}</span>
                      <Tag variant={r.status === "pass" ? "success" : r.status === "warn" ? "default" : "error"}>{r.status}</Tag>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{extractDetail(r.details)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </GR>

      {/* History section */}
      {history && (
        <GR>
          <div style={{ border: `1px solid ${T.border}`, borderTop: "none", borderRadius: `0 0 ${T.r}px ${T.r}px`, position: "relative", overflow: "hidden" }}>
            <PixelCorners />
            <div style={{ padding: 20 }}>
              <SectionLabel>HISTORIKK &mdash; {selectedRepo}</SectionLabel>
              {historyLoading ? (
                <div style={{ padding: "20px 0" }}>
                  <Skeleton rows={4} />
                </div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: 12, color: T.textMuted, padding: "16px 0" }}>Ingen historikk funnet for dette repoet.</div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 2fr", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>DATO</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>TYPE</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>STATUS</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>DETALJER</span>
                  </div>
                  {history.map((h, i) => (
                    <div key={h.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 2fr", padding: "8px 0", borderBottom: i < history.length - 1 ? `1px solid ${T.border}` : "none", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
                        {new Date(h.createdAt).toLocaleDateString("nb-NO", { day: "2-digit", month: "short" })} {new Date(h.createdAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span style={{ fontSize: 12, color: T.textSec }}>{h.checkType}</span>
                      <Tag variant={h.status === "pass" ? "success" : h.status === "warn" ? "default" : "error"}>{h.status}</Tag>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{extractDetail(h.details)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </GR>
      )}

      <GR mb={40}><div style={{ height: 1 }} /></GR>
    </>
  );
}
