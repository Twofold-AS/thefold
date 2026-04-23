"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { T, S } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import {
  getMe,
  logout,
  updateProfile,
  updatePreferences,
  listIntegrations,
  getMonitorHealth,
  runMonitorCheck,
  getCacheStats,
  getSecretsStatus,
  listAuditLog,
  getCircuitState,
  listArchivedConversations,
  restoreConversation,
  deleteConversationPermanent,
  cleanupOrphanedSubTasks,
} from "@/lib/api";
import { apiFetch } from "@/lib/api/client";
import { clearToken } from "@/lib/auth";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import Toggle from "@/components/Toggle";
import SectionLabel from "@/components/SectionLabel";
import Skeleton from "@/components/Skeleton";
import StatCard from "@/components/shared/StatCard";
import { GR } from "@/components/GridRow";
import TabWrapper from "@/components/TabWrapper";
import Link from "next/link";

// Lazy-load tab content so it renders inline inside the TabBar
const ModelsTab = lazy(() => import("@/app/(dashboard)/settings/models/page"));
const IntegrationsTab = lazy(() => import("@/app/(dashboard)/integrasjoner/page"));
const MCPTab = lazy(() => import("@/app/(dashboard)/innstillinger/mcp/page"));
const UsersTab = lazy(() => import("@/app/(dashboard)/innstillinger/UsersTab"));

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "\u2014";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })
      + ", "
      + d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "\u2014";
  }
}

const inputStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  color: T.text,
  fontFamily: T.sans,
  outline: "none",
  boxSizing: "border-box",
};

const sysCardStyle: React.CSSProperties = {
  background: T.sidebar,
  border: `1px solid ${T.border}`,
  borderRadius: T.r,
  padding: S.lg,
};

// --- Shared modal overlay ---
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div style={{
        background: "#1b1c1e",
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 28,
        width: 400,
        maxWidth: "90vw",
      }}>
        {children}
      </div>
    </div>
  );
}

function ArchivedConversationsTab() {
  const { data, loading, refresh } = useApiData(() => listArchivedConversations(), []);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const convs = data?.conversations ?? [];

  const handleRestore = async (id: string) => {
    setRestoreError(null);
    setActionId(id);
    try { await restoreConversation(id); refresh(); }
    catch { setRestoreError("Gjenoppretting feilet — prøv igjen"); }
    finally { setActionId(null); }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteId) return;
    setDeleteError(null);
    setActionId(confirmDeleteId);
    try {
      await deleteConversationPermanent(confirmDeleteId);
      setConfirmDeleteId(null);
      refresh();
    } catch {
      setDeleteError("Sletting feilet — prøv igjen");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S.lg }}>
      <p style={{ fontSize: 13, color: T.textMuted }}>
        Samtaler du har arkivert fra historikk-visningen. Du kan gjenopprette dem eller slette dem permanent.
      </p>

      {restoreError && (
        <div style={{ fontSize: 12, color: T.error, padding: "8px 12px", background: `${T.error}15`, borderRadius: 6 }}>
          {restoreError}
        </div>
      )}

      <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: "hidden", background: T.sidebar }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: T.textMuted }}>Laster...</div>
        ) : convs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: T.textMuted }}>Ingen arkiverte samtaler.</div>
        ) : convs.map((c, i) => (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
            borderBottom: i < convs.length - 1 ? `1px solid ${T.border}` : "none",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.textFaint, flexShrink: 0 }}>inventory_2</span>
            <span style={{ flex: 1, fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
            <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono, flexShrink: 0 }}>
              {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString("nb-NO") : ""}
            </span>
            <button
              onClick={() => handleRestore(c.id)}
              disabled={actionId === c.id}
              style={{ padding: "4px 12px", fontSize: 11, background: T.tabActive, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, cursor: "pointer", fontFamily: T.sans, flexShrink: 0, opacity: actionId === c.id ? 0.5 : 1 }}
            >
              Gjenopprett
            </button>
            <button
              onClick={() => { setDeleteError(null); setConfirmDeleteId(c.id); }}
              disabled={actionId === c.id}
              style={{ padding: "4px 12px", fontSize: 11, background: "transparent", border: `1px solid ${T.error}40`, borderRadius: 6, color: T.error, cursor: "pointer", fontFamily: T.sans, flexShrink: 0, opacity: actionId === c.id ? 0.5 : 1 }}
            >
              Slett permanent
            </button>
          </div>
        ))}
      </div>

      {/* Confirm delete modal */}
      {confirmDeleteId && (
        <ModalOverlay onClose={() => { setConfirmDeleteId(null); setDeleteError(null); }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 10 }}>Slett permanent?</div>
          <p style={{ fontSize: 13, color: T.textMuted, marginBottom: deleteError ? 12 : 20, lineHeight: 1.5 }}>
            Denne samtalen slettes for alltid og kan ikke gjenopprettes.
          </p>
          {deleteError && (
            <div style={{ fontSize: 12, color: T.error, marginBottom: 14, padding: "8px 10px", background: `${T.error}15`, borderRadius: 6 }}>
              {deleteError}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
              style={{ padding: "7px 16px", fontSize: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 7, color: T.textMuted, cursor: "pointer", fontFamily: T.sans }}
            >
              Avbryt
            </button>
            <button
              onClick={handleDeleteConfirmed}
              disabled={actionId === confirmDeleteId}
              style={{ padding: "7px 16px", fontSize: 12, background: T.error, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontFamily: T.sans, opacity: actionId === confirmDeleteId ? 0.5 : 1 }}
            >
              {actionId === confirmDeleteId ? "Sletter..." : "Slett permanent"}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function SystemTab() {
  const [monitorRunning, setMonitorRunning] = useState(false);
  const [monitorRepo, setMonitorRepo] = useState("webapp");

  // Prune minner
  const [pruneOpen, setPruneOpen] = useState(false);
  const [pruneStatus, setPruneStatus] = useState("");
  const [pruneRunning, setPruneRunning] = useState(false);

  // Orphan tasks cleanup
  const [orphanRunning, setOrphanRunning] = useState(false);
  const [orphanResult, setOrphanResult] = useState<string | null>(null);

  const { data: monitorData, refresh: refreshMonitor } = useApiData(() => getMonitorHealth(), []);
  const { data: cacheData } = useApiData(() => getCacheStats(), []);
  const { data: secretsData } = useApiData(() => getSecretsStatus(), []);
  const { data: auditData } = useApiData(() => listAuditLog({ limit: 10 }), []);

  const circuitState = getCircuitState();

  const handleRunCheck = useCallback(async () => {
    setMonitorRunning(true);
    try {
      await runMonitorCheck(monitorRepo);
      refreshMonitor();
    } catch { /* ignore */ }
    finally { setMonitorRunning(false); }
  }, [monitorRepo, refreshMonitor]);

  const handlePruneMinner = async () => {
    setPruneOpen(true);
    setPruneRunning(true);
    setPruneStatus("Henter minner...");

    // Cycle through status messages while waiting for the API
    const steps = [
      { msg: "Analyserer duplikater...", delay: 1800 },
      { msg: "Rydder opp...", delay: 3600 },
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach(({ msg, delay }) => {
      timers.push(setTimeout(() => setPruneStatus(msg), delay));
    });

    try {
      const result = await apiFetch<{
        memoriesConsolidated?: number;
        memoriesPruned?: number;
        success?: boolean;
      }>("/memory/dream", { method: "POST", body: {} });
      timers.forEach(clearTimeout);
      const pruned = result.memoriesPruned ?? 0;
      const consolidated = result.memoriesConsolidated ?? 0;
      setPruneStatus(`Ferdig — ${pruned} minner fjernet, ${consolidated} konsolidert`);
    } catch (err) {
      timers.forEach(clearTimeout);
      setPruneStatus(`Feil: ${err instanceof Error ? err.message : "ukjent feil"}`);
    } finally {
      setPruneRunning(false);
    }
  };

  const handleOrphanCleanup = async () => {
    setOrphanRunning(true);
    setOrphanResult(null);
    try {
      const res = await cleanupOrphanedSubTasks();
      setOrphanResult(`${res.deleted} foreldreløse under-oppgaver fjernet`);
    } catch (err) {
      setOrphanResult(`Feil: ${err instanceof Error ? err.message : "ukjent feil"}`);
    } finally {
      setOrphanRunning(false);
    }
  };

  // Flatten monitor results
  const monitorResults: Array<{ repo: string; checkType: string; status: string }> = [];
  if (monitorData?.repos) {
    for (const [repo, checks] of Object.entries(monitorData.repos)) {
      for (const check of checks as Array<{ checkType: string; status: string }>) {
        monitorResults.push({ repo, checkType: check.checkType, status: check.status });
      }
    }
  }

  const statusIcon = (s: string) => s === "pass" ? "🟢" : s === "warn" ? "🟡" : "🔴";

  const auditEntries = (auditData as any)?.entries ?? (auditData as any)?.logs ?? [];

  return (
    <div style={{ paddingTop: 0, display: "flex", flexDirection: "column", gap: S.lg }}>
      {/* Circuit breaker status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: S.md }}>
        <StatCard
          label="Circuit breaker"
          value={circuitState === "open" ? "Åpen" : circuitState === "half_open" ? "Halvåpen" : "Lukket"}
          color={circuitState === "open" ? "error" : circuitState === "half_open" ? "warning" : "success"}
        />
        <StatCard
          label="Cache hit rate"
          value={cacheData ? `${Math.min((cacheData.hitRate ?? 0) > 1 ? (cacheData.hitRate ?? 0) : (cacheData.hitRate ?? 0) * 100, 100).toFixed(0)}%` : "—"}
        />
        <StatCard
          label="Cache entries"
          value={cacheData?.totalEntries ?? "—"}
        />
        <StatCard
          label="Secrets"
          value={secretsData ? `${Object.values(secretsData).filter(Boolean).length} konfigurert` : "—"}
          color="success"
        />
      </div>

      {/* Vedlikehold */}
      <div style={sysCardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Vedlikehold</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Prune minner */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>Rydd opp minner</div>
              <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>Konsolider duplikater og fjern utdaterte minner via dream engine</div>
            </div>
            <Btn size="sm" onClick={handlePruneMinner}>Kjør nå</Btn>
          </div>
          {/* Orphan subtasks */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
            <div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>Rydd opp foreldreløse oppgaver</div>
              <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>Slett under-oppgaver som mangler overordnet oppgave</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {orphanResult && (
                <span style={{ fontSize: 11, color: orphanResult.startsWith("Feil") ? T.error : T.textMuted, fontFamily: T.mono }}>
                  {orphanResult}
                </span>
              )}
              <Btn size="sm" loading={orphanRunning} onClick={handleOrphanCleanup}>Kjør nå</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Monitor */}
      <div style={sysCardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Monitor</div>
        <div style={{ display: "flex", gap: S.sm, alignItems: "center", marginBottom: S.md }}>
          <select
            value={monitorRepo}
            onChange={(e) => setMonitorRepo(e.target.value)}
            style={{ ...inputStyle, width: 200 }}
          >
            {["webapp", "api-server", "mobile"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <Btn size="sm" variant="primary" loading={monitorRunning} onClick={handleRunCheck}>
            Kjør nå
          </Btn>
        </div>
        {monitorResults.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {monitorResults.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                  <span style={{ fontSize: 12, fontFamily: T.mono, color: T.text }}>{r.repo}</span>
                  <Tag>{r.checkType}</Tag>
                </div>
                <span style={{ fontSize: 12 }}>{statusIcon(r.status)} {r.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: T.textFaint }}>Ingen resultater ennå. Kjør en sjekk for å se status.</p>
        )}
      </div>

      {/* Cache stats */}
      <div style={sysCardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Cache</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S.md }}>
          {[
            { label: "Embeddings", hits: cacheData?.embeddingHits ?? 0, misses: cacheData?.embeddingMisses ?? 0, ttl: "90d" },
            { label: "Repo-struktur", hits: cacheData?.repoHits ?? 0, misses: cacheData?.repoMisses ?? 0, ttl: "1h" },
            { label: "AI-planer", hits: cacheData?.aiPlanHits ?? 0, misses: cacheData?.aiPlanMisses ?? 0, ttl: "24h" },
          ].map((c) => {
            const total = c.hits + c.misses;
            const rate = total > 0 ? ((c.hits / total) * 100).toFixed(0) : "—";
            return (
              <div key={c.label} style={{ background: T.subtle, padding: S.md, borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: S.xs }}>{c.label}</div>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>
                  {total} entries · {rate}% hit rate · {c.ttl} TTL
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cron jobs */}
      <div style={sysCardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Cron-jobber</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {[
            { name: "daily-health-check", schedule: "03:00 daglig", service: "monitor" },
            { name: "repo-watch-cron", schedule: "*/30 * * * *", service: "monitor" },
            { name: "daily-digest", schedule: "08:00 daglig", service: "monitor" },
            { name: "agent-jobs-cleanup", schedule: "hver 6. time", service: "agent" },
            { name: "rate-limit-cleanup", schedule: "03:00 daglig", service: "agent" },
            { name: "dream-engine", schedule: "søndag 03:00", service: "memory" },
            { name: "memory-consolidation", schedule: "daglig 04:00", service: "memory" },
            { name: "healing-quality-check", schedule: "daglig 05:00", service: "registry" },
            { name: "linear-sync", schedule: "*/15 * * * *", service: "linear" },
            { name: "docker-cleanup", schedule: "*/30 * * * *", service: "sandbox" },
            { name: "token-revocation-cleanup", schedule: "daglig 02:00", service: "gateway" },
          ].map((cron, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                <span style={{ fontSize: 12, fontFamily: T.mono, color: T.text }}>{cron.name}</span>
                <Tag variant="default">{cron.service}</Tag>
              </div>
              <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>{cron.schedule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div style={sysCardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Sikkerhet</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S.md }}>
          <div style={{ background: T.subtle, padding: S.md, borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: S.xs }}>Autentisering</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>OTP via Resend</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>Token-utløp: 30 dager</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>HMAC SHA-256 signering</div>
          </div>
          <div style={{ background: T.subtle, padding: S.md, borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: S.xs }}>Beskyttelse</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>Rate-limit: 20/t, 100/d</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>Agent scope-validering</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>Circuit breaker (3 tjenester)</div>
          </div>
        </div>
      </div>

      {/* Audit log */}
      <div style={sysCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S.md }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Audit-logg</div>
          <Link href="/audit" style={{ textDecoration: "none" }}>
            <Btn size="sm">Se alle</Btn>
          </Link>
        </div>
        {auditEntries.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {auditEntries.slice(0, 8).map((entry: any, i: number) => (
              <div
                key={entry.id ?? i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: S.sm }}>
                  <Tag variant={entry.action?.includes("error") || entry.action?.includes("fail") ? "error" : "default"}>
                    {entry.action ?? entry.eventType ?? "—"}
                  </Tag>
                  <span style={{ fontSize: 12, color: T.textSec }}>{entry.details ?? entry.description ?? "—"}</span>
                </div>
                <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                  {entry.createdAt ? formatDate(entry.createdAt) : "—"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: T.textFaint }}>Ingen audit-hendelser registrert.</p>
        )}
      </div>

      {/* Feature flags */}
      <div style={sysCardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: S.md }}>Feature Flags</div>
        <div style={{ fontSize: 12, color: T.textMuted }}>Ingen aktive feature flags</div>
      </div>

      {/* Prune minner modal */}
      {pruneOpen && (
        <ModalOverlay onClose={pruneRunning ? undefined : () => setPruneOpen(false)}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 16 }}>Rydd opp minner</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            {pruneRunning && (
              <span style={{
                display: "inline-block", width: 14, height: 14,
                border: `2px solid ${T.border}`, borderTopColor: T.accent,
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }} />
            )}
            <span style={{ fontSize: 13, color: pruneRunning ? T.textMuted : T.text, fontFamily: T.mono }}>
              {pruneStatus}
            </span>
          </div>
          {!pruneRunning && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setPruneOpen(false)}
                style={{ padding: "7px 18px", fontSize: 12, background: T.accent, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontFamily: T.sans }}
              >
                Lukk
              </button>
            </div>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </ModalOverlay>
      )}
    </div>
  );
}

export default function InnstillingerPage() {
  const router = useRouter();
  const { data: meData, loading: meLoading } = useApiData(() => getMe(), []);
  const { data: integrationsData } = useApiData(() => listIntegrations(), []);

  const user = meData?.user;

  // Check integrations for Slack
  const slackConfigured = (integrationsData?.configs ?? []).some(
    (c) => c.platform === "slack" && c.enabled
  );

  // Check push notification permission
  const pushGranted = typeof Notification !== "undefined" && Notification.permission === "granted";

  // --- Notification toggles ---
  const [notif, setNotif] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("tf_notif") !== "false";
  });
  const [slackNotif, setSlackNotif] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("tf_slackNotif") !== "false";
  });
  const [emailNotif, setEmailNotif] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("tf_emailNotif") === "true";
  });

  useEffect(() => { localStorage.setItem("tf_notif", String(notif)); }, [notif]);
  useEffect(() => { localStorage.setItem("tf_slackNotif", String(slackNotif)); }, [slackNotif]);
  useEffect(() => { localStorage.setItem("tf_emailNotif", String(emailNotif)); }, [emailNotif]);

  // --- Profile editing ---
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [aiName, setAiName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [saveNameError, setSaveNameError] = useState<string | null>(null);
  const [editAiName, setEditAiName] = useState(false);
  const [savingAiName, setSavingAiName] = useState(false);
  const [saveAiNameError, setSaveAiNameError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setNameVal(user.name);
    if (user?.preferences && typeof user.preferences === "object") {
      const prefs = user.preferences as Record<string, unknown>;
      if (typeof prefs.aiName === "string") setAiName(prefs.aiName);
    }
  }, [user]);

  const handleSaveName = async () => {
    setSavingName(true);
    setSaveNameError(null);
    try {
      await updateProfile({ name: nameVal });
      setEditName(false);
    } catch (e) {
      setSaveNameError(e instanceof Error ? e.message : "Feil ved lagring");
    } finally {
      setSavingName(false);
    }
  };

  const [revoking, setRevoking] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profil");

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await logout();
    } catch {
      // proceed to clear even if API call fails
    }
    clearToken();
    router.push("/login");
  };

  return (
    <>
      <div style={{ paddingTop: 0, paddingBottom: 16 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Innstillinger</h2>
        <p style={{ fontSize: 13, color: T.textMuted, marginBottom: S.md }}>Konfigurer profil, varsler og preferanser.</p>

        <TabWrapper
          tabs={[
            { id: "profil", label: "Profil" },
            { id: "ai", label: "AI-modeller" },
            { id: "integrasjoner", label: "Integrasjoner" },
            { id: "mcp", label: "MCP" },
            { id: "maler", label: "Maler" },
            { id: "system", label: "System" },
            { id: "arkiv", label: "Arkiverte samtaler" },
            // Admin-only — Commit 29. Hidden entirely for regular users.
            ...(user?.role === "admin" || user?.role === "superadmin"
              ? [{ id: "brukere", label: "Brukere" }]
              : []),
          ]}
          active={settingsTab}
          onChange={(id) => setSettingsTab(id)}
        />
      </div>


      {settingsTab === "ai" && (
        <Suspense fallback={<Skeleton rows={6} />}>
          <ModelsTab />
        </Suspense>
      )}

      {settingsTab === "integrasjoner" && (
        <Suspense fallback={<Skeleton rows={6} />}>
          <IntegrationsTab />
        </Suspense>
      )}

      {settingsTab === "mcp" && (
        <Suspense fallback={<Skeleton rows={6} />}>
          <MCPTab />
        </Suspense>
      )}

      {settingsTab === "brukere" && (user?.role === "admin" || user?.role === "superadmin") && (
        <Suspense fallback={<Skeleton rows={6} />}>
          <UsersTab currentUserRole={user.role} currentUserEmail={user.email} />
        </Suspense>
      )}

      {settingsTab === "maler" && (
        <div style={{ paddingTop: 0 }}>
          <p style={{ fontSize: 13, color: T.textMuted, marginBottom: S.md }}>
            Pre-bygde maler for vanlige mønstre — auth, API, forms, betalinger.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: S.md }}>
            {["auth", "api", "ui", "database", "payment", "form"].map((cat) => (
              <div
                key={cat}
                style={{
                  background: T.sidebar,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.r,
                  padding: S.md,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text, textTransform: "capitalize" }}>{cat}</div>
                <div style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono, marginTop: 4 }}>Kategori</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {settingsTab === "system" && <SystemTab />}

      {settingsTab === "arkiv" && <ArchivedConversationsTab />}

      {settingsTab === "profil" && <><GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: 12, border: `1px solid ${T.border}`, position: "relative", overflow: "hidden" }}>

          {/* Left column: PROFIL + AUTENTISERING + Revoke */}
          <div style={{ padding: 24, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>PROFIL</SectionLabel>
            <div style={{ marginBottom: 20 }}>
              {/* Navn row - editable */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>Navn</span>
                {editName ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        value={nameVal}
                        onChange={(e) => setNameVal(e.target.value)}
                        style={{ ...inputStyle, width: 160 }}
                      />
                      <Btn sm primary onClick={handleSaveName} style={{ opacity: savingName ? 0.5 : 1 }}>
                        {savingName ? "..." : "Lagre"}
                      </Btn>
                    </div>
                    {saveNameError && (
                      <span style={{ fontSize: 11, color: T.error }}>{saveNameError}</span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                      {meLoading ? <Skeleton width={100} height={14} /> : (user?.name || "\u2014")}
                    </span>
                    <Btn sm onClick={() => { setSaveNameError(null); setEditName(true); }}>Endre</Btn>
                  </div>
                )}
              </div>

              {/* AI-navn row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>AI-navn</span>
                {editAiName ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        value={aiName}
                        onChange={(e) => setAiName(e.target.value)}
                        placeholder="Navn agenten bruker"
                        style={{ ...inputStyle, width: 160 }}
                      />
                      <Btn sm primary onClick={async () => {
                        setSavingAiName(true);
                        setSaveAiNameError(null);
                        try {
                          await updatePreferences({ aiName });
                          setEditAiName(false);
                        } catch (e) {
                          setSaveAiNameError(e instanceof Error ? e.message : "Feil ved lagring");
                        }
                        finally { setSavingAiName(false); }
                      }} style={{ opacity: savingAiName ? 0.5 : 1 }}>
                        {savingAiName ? "..." : "Lagre"}
                      </Btn>
                    </div>
                    {saveAiNameError && (
                      <span style={{ fontSize: 11, color: T.error }}>{saveAiNameError}</span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                      {aiName || "\u2014"}
                    </span>
                    <Btn sm onClick={() => { setSaveAiNameError(null); setEditAiName(true); }}>Endre</Btn>
                  </div>
                )}
              </div>

              {/* E-post row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>E-post</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                  {meLoading ? <Skeleton width={100} height={14} /> : (user?.email || "\u2014")}
                </span>
              </div>

              {/* Rolle row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>Rolle</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                  {meLoading ? <Skeleton width={100} height={14} /> : (user?.role || "\u2014")}
                </span>
              </div>

              {/* Organisasjon row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>Organisasjon</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>Twofold AS</span>
              </div>
            </div>

            <SectionLabel>AUTENTISERING</SectionLabel>
            <div style={{ marginBottom: 16 }}>
              {[
                { l: "Auth-metode", v: "OTP via Resend" },
                { l: "Token-utl\u00F8p", v: "30 dager" },
                { l: "Siste innlogging", v: meLoading ? null : formatDate(user?.lastLoginAt) },
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>{f.l}</span>
                  {f.v === null ? (
                    <Skeleton width={100} height={14} />
                  ) : (
                    <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec }}>{f.v}</span>
                  )}
                </div>
              ))}
            </div>
            <Btn sm onClick={handleRevoke} style={{ opacity: revoking ? 0.5 : 1, pointerEvents: revoking ? "none" : "auto" }}>
              {revoking ? "Revokerer..." : "Revoke alle tokens"}
            </Btn>
          </div>

          {/* Right column: VARSLER + VARSEL-EVENTS + FEATURE FLAGS */}
          <div style={{ padding: 24 }}>
            <SectionLabel>VARSLER</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{ opacity: pushGranted ? 1 : 0.5 }}
                title={pushGranted ? undefined : "Aktiver push-varsler i nettleseren f\u00F8rst"}
              >
                <Toggle
                  checked={notif && pushGranted}
                  onChange={(v) => { if (pushGranted) setNotif(v); }}
                  label="Push-varsler"
                />
              </div>
              <div
                style={{ opacity: slackConfigured ? 1 : 0.5 }}
                title={slackConfigured ? undefined : "Koble til Slack under Integrasjoner f\u00F8rst"}
              >
                <Toggle
                  checked={slackNotif && slackConfigured}
                  onChange={(v) => { if (slackConfigured) setSlackNotif(v); }}
                  label="Slack-varsler"
                />
              </div>
              <Toggle checked={emailNotif} onChange={setEmailNotif} label="E-postvarsler" />
            </div>

            <div style={{ marginTop: 20 }}>
              <SectionLabel>VARSEL-EVENTS</SectionLabel>
              {["task.completed", "review.pending", "health.alert", "agent.error"].map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec }}>{e}</span>
                  <Tag variant="success">aktiv</Tag>
                </div>
              ))}
            </div>

          </div>
        </div>
      </GR>

      <GR mb={40}>
        <div style={{ height: 1 }} />
      </GR></>}
    </>
  );
}
