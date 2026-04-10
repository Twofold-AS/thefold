// --- MCP Persistence ---
// Tracks active MCP server connection state in the mcp_servers DB table.
// Columns used: session_active, session_started_at, last_heartbeat_at, status
// (added by migrations/5_add_sessions.up.sql)
//
// router.ts calls these functions during start/stop. This module also exposes
// a healthCheck() that pings every installed server.

import log from "encore.dev/log";
import { db } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Connection state tracking
// ─────────────────────────────────────────────────────────────────────────────

/** Mark a server's session as active in the DB */
export async function markSessionActive(serverName: string): Promise<void> {
  await db.exec`
    UPDATE mcp_servers
    SET session_active     = true,
        session_started_at = NOW(),
        last_heartbeat_at  = NOW(),
        updated_at         = NOW()
    WHERE name = ${serverName}
  `;
}

/** Mark a server's session as inactive (disconnected or error) */
export async function markSessionInactive(serverName: string): Promise<void> {
  await db.exec`
    UPDATE mcp_servers
    SET session_active    = false,
        last_heartbeat_at = NULL,
        updated_at        = NOW()
    WHERE name = ${serverName}
  `;
}

/** Update heartbeat timestamp to signal the server is still alive */
export async function updateHeartbeat(serverName: string): Promise<void> {
  await db.exec`
    UPDATE mcp_servers
    SET last_heartbeat_at = NOW()
    WHERE name = ${serverName}
  `;
}

/** Persist an error status for a server */
export async function markServerError(serverName: string): Promise<void> {
  await db.exec`
    UPDATE mcp_servers
    SET status = 'error', session_active = false, updated_at = NOW()
    WHERE name = ${serverName}
  `;
}

/** Clear all session_active flags (called on shutdown) */
export async function clearAllSessions(serverNames: string[]): Promise<void> {
  if (serverNames.length === 0) return;
  await db.exec`
    UPDATE mcp_servers
    SET session_active = false, last_heartbeat_at = NULL, updated_at = NOW()
    WHERE name = ANY(${serverNames}::text[])
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconnect-on-startup helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistedServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  envVars: Record<string, string>;
  status: string;
  category: string;
  description: string | null;
  configRequired: boolean;
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Read all servers that were active when the service last stopped.
 * Used by router.ts on startup to reconnect previously active sessions.
 */
export async function getSessionsToReconnect(): Promise<PersistedServerConfig[]> {
  const rows = db.query<{
    id: string; name: string; command: string; args: string[];
    env_vars: unknown; status: string; config_required: boolean;
    installed_at: Date | null; created_at: Date; updated_at: Date;
    description: string | null; category: string;
  }>`
    SELECT * FROM mcp_servers
    WHERE session_active = true AND status = 'installed'
    ORDER BY name
  `;

  const result: PersistedServerConfig[] = [];
  for await (const row of rows) {
    result.push({
      id: row.id,
      name: row.name,
      command: row.command,
      args: row.args ?? [],
      envVars: typeof row.env_vars === "string"
        ? JSON.parse(row.env_vars)
        : (row.env_vars as Record<string, string>) ?? {},
      status: row.status,
      category: row.category,
      description: row.description,
      configRequired: row.config_required,
      installedAt: row.installed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerHealthStatus {
  name: string;
  connected: boolean;
  lastHeartbeat: string | null;
  status: "connected" | "disconnected" | "error";
  detail?: string;
}

/**
 * Check the persisted connection state of all installed MCP servers.
 * A server is considered healthy if session_active=true and its
 * last_heartbeat_at is within the last 30 seconds.
 */
export async function healthCheck(): Promise<ServerHealthStatus[]> {
  const results: ServerHealthStatus[] = [];

  const rows = db.query<{
    name: string;
    status: string;
    session_active: boolean;
    last_heartbeat_at: Date | null;
  }>`
    SELECT name, status, session_active, last_heartbeat_at
    FROM mcp_servers
    WHERE status IN ('installed', 'error')
    ORDER BY name
  `;

  const now = Date.now();
  const HEARTBEAT_STALE_MS = 30_000;

  for await (const row of rows) {
    const heartbeat = row.last_heartbeat_at;
    const heartbeatAge = heartbeat ? now - heartbeat.getTime() : Infinity;
    const isAlive = row.session_active && heartbeatAge < HEARTBEAT_STALE_MS;

    let status: ServerHealthStatus["status"];
    let detail: string | undefined;

    if (row.status === "error") {
      status = "error";
      detail = "Server reported an error on last connection attempt";
    } else if (isAlive) {
      status = "connected";
    } else if (row.session_active && heartbeatAge >= HEARTBEAT_STALE_MS) {
      status = "error";
      detail = `Heartbeat stale (${Math.round(heartbeatAge / 1000)}s ago)`;
    } else {
      status = "disconnected";
    }

    results.push({
      name: row.name,
      connected: status === "connected",
      lastHeartbeat: heartbeat?.toISOString() ?? null,
      status,
      detail,
    });
  }

  log.info("MCP health check completed", {
    total: results.length,
    connected: results.filter(r => r.status === "connected").length,
    disconnected: results.filter(r => r.status === "disconnected").length,
    errors: results.filter(r => r.status === "error").length,
  });

  return results;
}
