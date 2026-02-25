"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import { useApiData } from "@/lib/hooks";
import { getMe, logout, updateProfile, updatePreferences } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import Toggle from "@/components/Toggle";
import SectionLabel from "@/components/SectionLabel";
import PixelCorners from "@/components/PixelCorners";
import Skeleton from "@/components/Skeleton";
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

export default function InnstillingerPage() {
  const router = useRouter();
  const { data: meData, loading: meLoading } = useApiData(() => getMe(), []);

  const user = meData?.user;

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
  const [savingAiName, setSavingAiName] = useState(false);

  useEffect(() => {
    if (user?.name) setNameVal(user.name);
    if (user?.preferences && typeof user.preferences === "object") {
      const prefs = user.preferences as Record<string, unknown>;
      if (typeof prefs.aiName === "string") setAiName(prefs.aiName);
    }
  }, [user]);

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await updateProfile({ name: nameVal });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Feil ved lagring");
    } finally {
      setSavingName(false);
      setEditName(false);
    }
  };

  const handleSaveAiName = async () => {
    setSavingAiName(true);
    try {
      await updatePreferences({ aiName });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Feil ved lagring");
    } finally {
      setSavingAiName(false);
    }
  };

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
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Innstillinger</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Konfigurer profil, varsler og preferanser.</p>
      </div>

      <GR>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${T.border}`, borderRadius: T.r, position: "relative", overflow: "hidden" }}>
          <PixelCorners />

          {/* Left column: PROFIL + AUTENTISERING + Revoke */}
          <div style={{ padding: 24, borderRight: `1px solid ${T.border}` }}>
            <SectionLabel>PROFIL</SectionLabel>
            <div style={{ marginBottom: 20 }}>
              {/* Navn row - editable */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>Navn</span>
                {editName ? (
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
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                      {meLoading ? <Skeleton width={100} height={14} /> : (user?.name || "—")}
                    </span>
                    <Btn sm onClick={() => setEditName(true)}>Endre</Btn>
                  </div>
                )}
              </div>

              {/* AI-navn row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>AI-navn</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={aiName}
                    onChange={(e) => setAiName(e.target.value)}
                    placeholder="Navn agenten bruker"
                    style={{ ...inputStyle, width: 160 }}
                  />
                  <Btn sm primary onClick={handleSaveAiName} style={{ opacity: savingAiName ? 0.5 : 1 }}>
                    {savingAiName ? "..." : "Lagre"}
                  </Btn>
                </div>
              </div>

              {/* E-post row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>E-post</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                  {meLoading ? <Skeleton width={100} height={14} /> : (user?.email || "—")}
                </span>
              </div>

              {/* Rolle row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.textMuted }}>Rolle</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
                  {meLoading ? <Skeleton width={100} height={14} /> : (user?.role || "—")}
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
                { l: "Token-utløp", v: "30 dager" },
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

            <div style={{ marginTop: 20 }}>
              <SectionLabel>FEATURE FLAGS</SectionLabel>
              {[
                { f: "ProgressMessageEnabled", v: true },
                { f: "MultiProviderEnabled", v: true },
                { f: "GitHubAppEnabled", v: true },
                { f: "DynamicSubAgentsEnabled", v: false },
                { f: "HealingPipelineEnabled", v: false },
                { f: "MonitorEnabled", v: true },
                { f: "SandboxAdvancedPipeline", v: true },
                { f: "MCPRoutingEnabled", v: true },
                { f: "RegistryExtractionEnabled", v: false },
              ].map((ff, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 8 ? `1px solid ${T.border}` : "none" }}>
                  <span style={{ fontSize: 12, fontFamily: T.mono, color: T.textSec }}>{ff.f}</span>
                  <Tag variant={ff.v ? "success" : "default"}>{ff.v ? "true" : "false"}</Tag>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GR>

      <GR mb={40}>
        <div style={{ height: 1 }} />
      </GR>
    </>
  );
}
