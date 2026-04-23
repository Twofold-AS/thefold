"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import {
  listMCPServers,
  installMCPServer,
  uninstallMCPServer,
  configureMCPServer,
  validateMCPServer,
  type MCPServer,
} from "@/lib/api";
import { RefreshCw, Plus, ChevronDown, ChevronRight } from "lucide-react";
import Tag from "@/components/Tag";

// --- Status label helper (Norwegian, matches Integrasjoner tone) ---

function statusTagVariant(status: MCPServer["status"]): "success" | "error" | "default" {
  if (status === "installed") return "success";
  if (status === "error" || status === "not_configured") return "error";
  return "default";
}

function statusTagLabel(status: MCPServer["status"]): string {
  switch (status) {
    case "installed":      return "tilkoblet";
    case "available":      return "tilgjengelig";
    case "not_configured": return "trenger konfig";
    case "error":          return "feil";
  }
}

// --- API key form ---

function ApiKeyForm({
  server,
  onSave,
  onClose,
}: {
  server: MCPServer;
  onSave: (envVars: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(Object.keys(server.envVars).map(k => [k, server.envVars[k] || ""])),
  );
  const [saving, setSaving] = useState(false);

  const knownEnvKeys = Object.keys(server.envVars);
  // If no envVars declared, provide a generic API key field
  const keys = knownEnvKeys.length > 0 ? knownEnvKeys : ["API_KEY"];

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        background: T.subtle,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        API Keys / Credentials
      </div>
      {keys.map(k => (
        <div key={k} style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 11, fontFamily: T.mono, color: T.textSec, marginBottom: 4 }}>
            {k}
          </label>
          <input
            type="password"
            value={values[k] || ""}
            onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))}
            placeholder={`Enter ${k}`}
            style={{
              width: "100%",
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              fontFamily: T.mono,
              color: T.text,
              outline: "none",
              boxSizing: "border-box" as const,
            }}
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn sm onClick={handleSave}>
          {saving ? "Saving…" : "Save & Configure"}
        </Btn>
        <Btn sm onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
}

// --- Server row ---

function ServerRow({
  server,
  onRefresh,
}: {
  server: MCPServer;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);

  const handleInstall = async () => {
    setActionLoading("install");
    try {
      await installMCPServer(server.id);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async () => {
    setActionLoading("uninstall");
    try {
      await uninstallMCPServer(server.id);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleHealthCheck = async () => {
    setActionLoading("health");
    setHealthResult(null);
    try {
      const result = await validateMCPServer(server.id);
      setHealthResult({ ok: result.status === "active", message: result.message });
      onRefresh();
    } catch (e) {
      setHealthResult({ ok: false, message: e instanceof Error ? e.message : "Check failed" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveKeys = async (envVars: Record<string, string>) => {
    await configureMCPServer(server.id, envVars);
    onRefresh();
  };

  const isInstalled = server.status === "installed";

  return (
    <>
      {/* Header row — klikkbar, collapsed-default */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", cursor: "pointer",
        }}
      >
        <span style={{ color: T.textFaint, flexShrink: 0 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>
              {server.name}
            </span>
            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
              {server.category}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <Tag variant={statusTagVariant(server.status)}>{statusTagLabel(server.status)}</Tag>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: "16px 20px",
            borderTop: `1px solid ${T.border}`,
            background: "#2a2d30",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {server.description && (
            <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
              {server.description}
            </p>
          )}

          {healthResult && (
            <div
              style={{
                fontSize: 11,
                fontFamily: T.mono,
                color: healthResult.ok ? T.success : T.error,
                marginBottom: 12,
              }}
            >
              {healthResult.ok ? "✓ " : "✗ "}{healthResult.message}
            </div>
          )}

          {showKeyForm && (
            <div style={{ marginBottom: 12 }}>
              <ApiKeyForm
                server={server}
                onSave={handleSaveKeys}
                onClose={() => setShowKeyForm(false)}
              />
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {isInstalled ? (
              <>
                <Btn sm onClick={handleUninstall}>
                  {actionLoading === "uninstall" ? "Kobler fra…" : "Koble fra"}
                </Btn>
                {server.configRequired && (
                  <Btn sm onClick={() => setShowKeyForm(v => !v)}>
                    {showKeyForm ? "Skjul nøkler" : "Rediger"}
                  </Btn>
                )}
                <Btn sm onClick={handleHealthCheck} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  <RefreshCw size={12} style={{
                    animation: actionLoading === "health" ? "spin 0.8s linear infinite" : "none",
                  }} />
                  {actionLoading === "health" ? "Sjekker…" : "Reconnect"}
                </Btn>
              </>
            ) : (
              <>
                <Btn sm primary onClick={handleInstall}>
                  {actionLoading === "install" ? "Installerer…" : "Koble til"}
                </Btn>
                {server.configRequired && (
                  <Btn sm onClick={() => setShowKeyForm(v => !v)}>
                    {showKeyForm ? "Skjul nøkler" : "Konfigurer"}
                  </Btn>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// --- Page ---

export default function MCPSetupPage() {
  const { data, loading, refresh } = useApiData(() => listMCPServers(), []);
  const servers = (data?.servers ?? []).filter(s => s.name !== "linear-mcp");

  const installed = servers.filter(s => s.status === "installed");
  const available = servers.filter(s => s.status !== "installed");

  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCommand, setCustomCommand] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  const handleAddCustom = async () => {
    if (!customName.trim() || !customCommand.trim()) {
      alert("Navn og kommando kreves");
      return;
    }
    setAddingCustom(true);
    try {
      const args = customArgs.trim().length > 0 ? customArgs.trim().split(/\s+/) : undefined;
      const resp = await fetch("/api/mcp/register-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customName.trim(),
          command: customCommand.trim(),
          args,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.message || `Status ${resp.status}`);
      }
      setCustomName("");
      setCustomCommand("");
      setCustomArgs("");
      setShowAddCustom(false);
      refresh();
    } catch (err) {
      alert(`Feil ved registrering: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddingCustom(false);
    }
  };

  return (
    <>
      <div style={{ paddingTop: 0, paddingBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>
            MCP Servers
          </h2>
          <p style={{ fontSize: 13, color: T.textMuted }}>
            Model Context Protocol servers extend the agent with tools for code, data, and docs.
          </p>
        </div>
        <Btn primary sm onClick={() => setShowAddCustom(true)}>
          <Plus size={13} style={{ marginRight: 4 }} />
          Legg til MCP
        </Btn>
      </div>

      <GR>
        {loading ? (
          <Skeleton rows={4} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {installed.length > 0 && (
              <>
                <SectionLabel>ACTIVE ({installed.length})</SectionLabel>
                {installed.map(s => (
                  <div key={s.id} style={{
                    background: T.sidebar,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r,
                    overflow: "hidden",
                  }}>
                    <ServerRow server={s} onRefresh={refresh} />
                  </div>
                ))}
              </>
            )}

            <SectionLabel>AVAILABLE ({available.length})</SectionLabel>
            {available.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: T.textFaint, background: T.sidebar, border: `1px solid ${T.border}`, borderRadius: T.r }}>
                All servers installed
              </div>
            ) : (
              available.map(s => (
                <div key={s.id} style={{
                  background: T.sidebar,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.r,
                  overflow: "hidden",
                }}>
                  <ServerRow server={s} onRefresh={refresh} />
                </div>
              ))
            )}
          </div>
        )}
      </GR>

      {/* Add Custom MCP Modal */}
      {showAddCustom && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddCustom(false); }}
        >
          <div
            style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: 24, width: 420,
              boxShadow: "0 24px 64px rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 20 }}>
              Legg til custom MCP-server
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontFamily: T.mono, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Navn
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="f.eks. my-custom-server"
                  style={{
                    width: "100%",
                    background: T.raised,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontFamily: T.mono,
                    color: T.text,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontFamily: T.mono, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Kommando
                </label>
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder="f.eks. node server.js"
                  style={{
                    width: "100%",
                    background: T.raised,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontFamily: T.mono,
                    color: T.text,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontFamily: T.mono, color: T.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Argumenter (valgfritt)
                </label>
                <input
                  type="text"
                  value={customArgs}
                  onChange={(e) => setCustomArgs(e.target.value)}
                  placeholder="f.eks. --config ./config.json"
                  style={{
                    width: "100%",
                    background: T.raised,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontFamily: T.mono,
                    color: T.text,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 20 }}>
              <Btn sm onClick={() => setShowAddCustom(false)}>Avbryt</Btn>
              <Btn
                primary sm
                onClick={handleAddCustom}
                style={{ opacity: addingCustom ? 0.6 : 1, pointerEvents: addingCustom ? "none" : "auto" }}
              >
                {addingCustom ? "Legger til..." : "Legg til"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
