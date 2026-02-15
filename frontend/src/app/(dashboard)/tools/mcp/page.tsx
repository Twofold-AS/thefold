"use client";

import { useEffect, useState } from "react";
import { listMCPServers, installMCPServer, uninstallMCPServer, type MCPServer } from "@/lib/api";

const CATEGORY_ICONS: Record<string, string> = {
  code: "\u{1F4C1}",
  data: "\u{1F5C4}\uFE0F",
  docs: "\u{1F4DA}",
  general: "\u{1F527}",
  ai: "\u{1F916}",
};

const STATUS_CONFIG = {
  installed: { label: "Installert", bg: "#22c55e20", color: "#22c55e" },
  available: { label: "Tilgjengelig", bg: "var(--bg-tertiary)", color: "var(--text-muted)" },
  error: { label: "Feil", bg: "#ef444420", color: "#ef4444" },
};

export default function MCPPage() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    try {
      const result = await listMCPServers();
      setServers(result.servers);
    } catch {
      // Fail silently — show empty state
    } finally {
      setLoading(false);
    }
  }

  async function handleInstall(id: string) {
    setActionLoading(id);
    try {
      const result = await installMCPServer(id);
      setServers((prev) =>
        prev.map((s) => (s.id === id ? result.server : s))
      );
    } catch {
      // Could show error toast
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUninstall(id: string) {
    setActionLoading(id);
    try {
      const result = await uninstallMCPServer(id);
      setServers((prev) =>
        prev.map((s) => (s.id === id ? result.server : s))
      );
    } catch {
      // Could show error toast
    } finally {
      setActionLoading(null);
    }
  }

  const installedServers = servers.filter((s) => s.status === "installed");
  const availableServers = servers.filter((s) => s.status !== "installed");

  return (
    <div className="space-y-6">
      {/* Info card */}
      <div className="card p-5">
        <h2 className="text-lg font-sans font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          Model Context Protocol
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          MCP-servere utvider TheFold sin kontekst med eksterne datakilder og verkt&oslash;y.
          Servere kobles til under AI-kall og gir tilgang til filer, databaser, API-er og mer.
        </p>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Laster MCP-servere...
        </div>
      ) : (
        <>
          {/* Installed servers */}
          {installedServers.length > 0 && (
            <div>
              <h3 className="text-sm font-sans font-medium mb-3 px-1" style={{ color: "var(--text-primary)" }}>
                Installerte servere
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {installedServers.map((server) => (
                  <MCPCard
                    key={server.id}
                    server={server}
                    loading={actionLoading === server.id}
                    onUninstall={() => handleUninstall(server.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Available servers */}
          {availableServers.length > 0 && (
            <div>
              <h3 className="text-sm font-sans font-medium mb-3 px-1" style={{ color: "var(--text-primary)" }}>
                Tilgjengelige servere
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableServers.map((server) => (
                  <MCPCard
                    key={server.id}
                    server={server}
                    loading={actionLoading === server.id}
                    onInstall={() => handleInstall(server.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {servers.length === 0 && (
            <div className="card p-5 text-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Ingen MCP-servere funnet. Sjekk at mcp-tjenesten kj&oslash;rer.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MCPCard({
  server,
  loading,
  onInstall,
  onUninstall,
}: {
  server: MCPServer;
  loading: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
}) {
  const statusStyle = STATUS_CONFIG[server.status] || STATUS_CONFIG.available;
  const icon = CATEGORY_ICONS[server.category] || "\u{1F527}";

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-sans text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {server.name}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: statusStyle.bg, color: statusStyle.color }}
            >
              {statusStyle.label}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
            >
              {server.category}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {server.description}
          </p>
          <p className="text-[10px] mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
            {server.command} {server.args.join(" ")}
          </p>

          {server.status === "available" && onInstall && (
            <button
              className="mt-3 px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--bg-primary)",
              }}
              onClick={onInstall}
              disabled={loading}
            >
              {loading ? "Installerer..." : "Installer"}
            </button>
          )}
          {server.status === "installed" && onUninstall && (
            <button
              className="mt-3 px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
              onClick={onUninstall}
              disabled={loading}
            >
              {loading ? "Avinstallerer..." : "Avinstaller"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
