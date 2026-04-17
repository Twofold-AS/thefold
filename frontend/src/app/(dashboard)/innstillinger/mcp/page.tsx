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
import { CheckCircle2, XCircle, Circle, RefreshCw, Key, Trash2, Plus } from "lucide-react";

// --- Status indicator ---

function StatusDot({ status }: { status: MCPServer["status"] }) {
  if (status === "installed") {
    return <CheckCircle2 size={14} style={{ color: T.success, flexShrink: 0 }} />;
  }
  if (status === "error" || status === "not_configured") {
    return <XCircle size={14} style={{ color: T.error, flexShrink: 0 }} />;
  }
  return <Circle size={14} style={{ color: T.textFaint, flexShrink: 0 }} />;
}

function statusLabel(status: MCPServer["status"]): string {
  switch (status) {
    case "installed": return "Active";
    case "available": return "Available";
    case "not_configured": return "Needs config";
    case "error": return "Error";
  }
}

function statusColor(status: MCPServer["status"]): string {
  if (status === "installed") return T.success;
  if (status === "error" || status === "not_configured") return T.error;
  return T.textFaint;
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

  return (
    <div
      style={{
        padding: "16px 20px",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Status */}
        <div style={{ paddingTop: 2 }}>
          <StatusDot status={server.status} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>
              {server.name}
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: T.mono,
                color: statusColor(server.status),
                textTransform: "uppercase",
              }}
            >
              {statusLabel(server.status)}
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: T.mono,
                color: T.textFaint,
                background: T.subtle,
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {server.category}
            </span>
          </div>
          {server.description && (
            <div style={{ fontSize: 12, color: T.textSec, marginBottom: 6 }}>
              {server.description}
            </div>
          )}
          {healthResult && (
            <div
              style={{
                fontSize: 11,
                fontFamily: T.mono,
                color: healthResult.ok ? T.success : T.error,
                marginBottom: 6,
              }}
            >
              {healthResult.ok ? "✓ " : "✗ "}{healthResult.message}
            </div>
          )}
          {showKeyForm && (
            <ApiKeyForm
              server={server}
              onSave={handleSaveKeys}
              onClose={() => setShowKeyForm(false)}
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {/* Health check — only for installed */}
          {server.status === "installed" && (
            <button
              onClick={handleHealthCheck}
              disabled={actionLoading !== null}
              title="Health check"
              style={{
                background: "none",
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                padding: "5px 8px",
                cursor: "pointer",
                color: T.textMuted,
                display: "flex",
                alignItems: "center",
              }}
            >
              <RefreshCw size={13} style={{ animation: actionLoading === "health" ? "spin 0.8s linear infinite" : "none" }} />
            </button>
          )}

          {/* API key config */}
          {server.configRequired && (
            <button
              onClick={() => setShowKeyForm(v => !v)}
              title="Configure API keys"
              style={{
                background: "none",
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                padding: "5px 8px",
                cursor: "pointer",
                color: showKeyForm ? T.accent : T.textMuted,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Key size={13} />
            </button>
          )}

          {/* Install / Uninstall */}
          {server.status === "installed" ? (
            <Btn sm onClick={handleUninstall}>
              {actionLoading === "uninstall" ? (
                <RefreshCw size={12} style={{ animation: "spin 0.8s linear infinite" }} />
              ) : (
                <Trash2 size={12} />
              )}
            </Btn>
          ) : (
            <Btn primary sm onClick={handleInstall}>
              {actionLoading === "install" ? "Installing…" : "Install"}
            </Btn>
          )}
        </div>
      </div>
    </div>
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
        <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          {/* Active servers */}
          {installed.length > 0 && (
            <>
              <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}`, background: T.subtle }}>
                <SectionLabel>ACTIVE ({installed.length})</SectionLabel>
              </div>
              {loading ? (
                <div style={{ padding: 20 }}><Skeleton rows={2} /></div>
              ) : (
                installed.map(s => (
                  <ServerRow key={s.id} server={s} onRefresh={refresh} />
                ))
              )}
            </>
          )}

          {/* Available servers */}
          <div style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}`, background: T.subtle }}>
            <SectionLabel>AVAILABLE ({available.length})</SectionLabel>
          </div>
          {loading ? (
            <div style={{ padding: 20 }}><Skeleton rows={4} /></div>
          ) : available.length === 0 ? (
            <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: T.textFaint }}>
              All servers installed
            </div>
          ) : (
            available.map(s => (
              <ServerRow key={s.id} server={s} onRefresh={refresh} />
            ))
          )}
        </div>
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
