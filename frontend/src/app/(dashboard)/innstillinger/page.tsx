"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { getMe, logout } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import Toggle from "@/components/Toggle";
import SectionLabel from "@/components/SectionLabel";
import PixelCorners from "@/components/PixelCorners";
import { GR } from "@/components/GridRow";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })
      + ", "
      + d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function InnstillingerPage() {
  const router = useRouter();
  const { data: meData, loading: meLoading } = useApiData(() => getMe(), []);

  const user = meData?.user;

  // --- localStorage-backed toggles ---
  const [agentOn, setAgentOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("tf_agentMode") !== "false";
  });
  const [subAgOn, setSubAgOn] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("tf_subAgents") === "true";
  });
  const [privat, setPrivat] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("tf_private") === "true";
  });
  const [autoApprove, setAutoApprove] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("tf_autoApprove") === "true";
  });
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
  const [sandboxMode, setSandboxMode] = useState(() => {
    if (typeof window === "undefined") return "docker";
    return localStorage.getItem("tf_sandboxMode") || "docker";
  });
  const [budget, setBudget] = useState(() => {
    if (typeof window === "undefined") return "balanced";
    return localStorage.getItem("tf_budget") || "balanced";
  });

  useEffect(() => { localStorage.setItem("tf_agentMode", String(agentOn)); }, [agentOn]);
  useEffect(() => { localStorage.setItem("tf_subAgents", String(subAgOn)); }, [subAgOn]);
  useEffect(() => { localStorage.setItem("tf_private", String(privat)); }, [privat]);
  useEffect(() => { localStorage.setItem("tf_autoApprove", String(autoApprove)); }, [autoApprove]);
  useEffect(() => { localStorage.setItem("tf_notif", String(notif)); }, [notif]);
  useEffect(() => { localStorage.setItem("tf_slackNotif", String(slackNotif)); }, [slackNotif]);
  useEffect(() => { localStorage.setItem("tf_emailNotif", String(emailNotif)); }, [emailNotif]);
  useEffect(() => { localStorage.setItem("tf_sandboxMode", sandboxMode); }, [sandboxMode]);
  useEffect(() => { localStorage.setItem("tf_budget", budget); }, [budget]);

  const [revoking, setRevoking] = useState(false);

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
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", fontFamily: T.brandFont, marginBottom: 8 }}>Innstillinger</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Konfigurer agent, varsler, sikkerhet og preferanser.</p>
      </div>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${T.border}`, borderRadius: T.r, position: "relative", overflow: "hidden" }}>
          <PixelCorners />

          {/* Left column: PROFIL + AUTENTISERING */}
          <div style={{ padding: 24, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>PROFIL</SectionLabel>
            <div style={{ marginBottom: 20 }}>
              {[
                { l: "Navn", v: meLoading ? "..." : (user?.name || "—") },
                { l: "E-post", v: meLoading ? "..." : (user?.email || "—") },
                { l: "Rolle", v: meLoading ? "..." : (user?.role || "—") },
                { l: "Organisasjon", v: "Twofold AS" },
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>{f.l}</span>
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{f.v}</span>
                </div>
              ))}
            </div>

            <SectionLabel>AUTENTISERING</SectionLabel>
            <div style={{ marginBottom: 16 }}>
              {[
                { l: "Auth-metode", v: "OTP via Resend" },
                { l: "Token-utløp", v: "30 dager" },
                { l: "Siste innlogging", v: meLoading ? "..." : formatDate(user?.lastLoginAt) },
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>{f.l}</span>
                  <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec }}>{f.v}</span>
                </div>
              ))}
            </div>
            <Btn sm onClick={handleRevoke} style={{ opacity: revoking ? 0.5 : 1, pointerEvents: revoking ? "none" : "auto" }}>
              {revoking ? "Revokerer..." : "Revoke alle tokens"}
            </Btn>
          </div>

          {/* Right column: AGENT-OPPFØRSEL + SANDBOX + KOSTNADSBUDSJETT */}
          <div style={{ padding: 24 }}>
            <SectionLabel>AGENT-OPPFØRSEL</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              <Toggle checked={agentOn} onChange={setAgentOn} label="Agent-modus" />
              <Toggle checked={subAgOn} onChange={setSubAgOn} label="Sub-agenter" />
              <Toggle checked={privat} onChange={setPrivat} label="Privat-modus (inkognito)" />
              <Toggle checked={autoApprove} onChange={setAutoApprove} label="Auto-godkjenn PRs (kvalitet >= 8)" />
            </div>

            <SectionLabel>SANDBOX</SectionLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {(["docker", "filesystem"] as const).map(m => (
                <div
                  key={m}
                  onClick={() => setSandboxMode(m)}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    background: sandboxMode === m ? T.accentDim : "transparent",
                    border: `1px solid ${sandboxMode === m ? T.accent : T.border}`,
                    borderRadius: T.r,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: sandboxMode === m ? T.accent : T.text, marginBottom: 2 }}>
                    {m === "docker" ? "Docker" : "Filesystem"}
                  </div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>
                    {m === "docker" ? "Isolert, --network=none" : "Lokal /tmp, for utvikling"}
                  </div>
                </div>
              ))}
            </div>

            <SectionLabel>KOSTNADSBUDSJETT</SectionLabel>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { k: "aggressive_save", l: "Aggressiv", d: "Laveste kostnad" },
                { k: "balanced", l: "Balansert", d: "Kvalitet/pris" },
                { k: "quality_first", l: "Kvalitet", d: "Best resultat" },
              ].map(b => (
                <div
                  key={b.k}
                  onClick={() => setBudget(b.k)}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    background: budget === b.k ? T.accentDim : "transparent",
                    border: `1px solid ${budget === b.k ? T.accent : T.border}`,
                    borderRadius: T.r,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: budget === b.k ? T.accent : T.text, marginBottom: 2 }}>{b.l}</div>
                  <div style={{ fontSize: 10, color: T.textMuted }}>{b.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GR>

      <GR mb={40}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${T.border}`, borderTop: "none", borderRadius: `0 0 ${T.r}px ${T.r}px`, position: "relative", overflow: "hidden" }}>
          <PixelCorners />

          {/* Left column: VARSLER + VARSEL-EVENTS */}
          <div style={{ padding: 24, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>VARSLER</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Toggle checked={notif} onChange={setNotif} label="Push-varsler" />
              <Toggle checked={slackNotif} onChange={setSlackNotif} label="Slack-varsler" />
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

          {/* Right column: API & SIKKERHET + FEATURE FLAGS */}
          <div style={{ padding: 24 }}>
            <SectionLabel>API & SIKKERHET</SectionLabel>
            {[
              { l: "API-nøkkel", v: "thf_••••••••k7x2", a: "Vis" },
              { l: "Webhook-secret", v: "whsec_••••••••m3p1", a: "Regenerer" },
              { l: "HMAC-algoritme", v: "SHA-256" },
              { l: "Rate limit", v: "100 req/min" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>{f.l}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec }}>{f.v}</span>
                  {f.a && <Btn sm>{f.a}</Btn>}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 20 }}>
              <SectionLabel>FEATURE FLAGS</SectionLabel>
              {[
                { f: "MonitorEnabled", v: true },
                { f: "SandboxAdvancedPipeline", v: true },
                { f: "MCPRoutingEnabled", v: true },
                { f: "RegistryExtractionEnabled", v: false },
                { f: "ZNewMessageContract", v: false },
              ].map((ff, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 4 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec }}>{ff.f}</span>
                  <Tag variant={ff.v ? "success" : "default"}>{ff.v ? "true" : "false"}</Tag>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GR>
    </>
  );
}
