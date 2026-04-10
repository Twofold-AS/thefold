import { api } from "encore.dev/api";
import log from "encore.dev/log";
import { MCPClient, MCPTool, MCPToolCallResult } from "./client";
import type { MCPServer } from "./types";
import { db } from "./db";

// In-memory pool of active MCP clients, keyed by server name
const activeClients = new Map<string, MCPClient>();

// Track whether we've done the initial reconnect on startup
let reconnectDone = false;

// --- Persistence helpers ---

async function markSessionActive(serverName: string): Promise<void> {
  await db.exec`
    UPDATE mcp_servers
    SET session_active    = true,
        session_started_at = NOW(),
        last_heartbeat_at  = NOW(),
        updated_at         = NOW()
    WHERE name = ${serverName}
  `;
}

async function markSessionInactive(serverName: string): Promise<void> {
  await db.exec`
    UPDATE mcp_servers
    SET session_active     = false,
        last_heartbeat_at  = NULL,
        updated_at         = NOW()
    WHERE name = ${serverName}
  `;
}

async function updateHeartbeat(serverName: string): Promise<void> {
  await db.exec`
    UPDATE mcp_servers SET last_heartbeat_at = NOW() WHERE name = ${serverName}
  `;
}

// Update heartbeats for all running clients every 10 seconds
setInterval(async () => {
  for (const [name, client] of activeClients) {
    if (client.isRunning()) {
      updateHeartbeat(name).catch(() => {});
    } else {
      // Client died unexpectedly — clean up
      activeClients.delete(name);
      markSessionInactive(name).catch(() => {});
    }
  }
}, 10_000);

// --- Reconnect previously active servers on startup ---

/**
 * On service startup, reconnect all servers that had an active session
 * when the service last stopped. Called lazily before the first use.
 */
async function reconnectPreviouslyActiveSessions(): Promise<void> {
  if (reconnectDone) return;
  reconnectDone = true;

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

  const toReconnect: MCPServer[] = [];
  for await (const row of rows) {
    toReconnect.push({
      id: row.id,
      name: row.name,
      description: row.description,
      command: row.command,
      args: row.args ?? [],
      envVars: typeof row.env_vars === "string" ? JSON.parse(row.env_vars) : (row.env_vars as Record<string, string>) ?? {},
      status: row.status as "installed",
      category: row.category as MCPServer["category"],
      config: {},
      configRequired: row.config_required,
      installedAt: row.installed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }

  if (toReconnect.length === 0) return;

  log.info("Reconnecting previously active MCP servers", { count: toReconnect.length });

  for (const server of toReconnect) {
    if (activeClients.has(server.name) && activeClients.get(server.name)!.isRunning()) continue;

    try {
      const client = new MCPClient(server.command, server.args, server.envVars, server.name, 15_000);
      await client.start();
      activeClients.set(server.name, client);
      await markSessionActive(server.name);

      log.info("MCP server reconnected after restart", {
        server: server.name,
        tools: client.getTools().map(t => t.name),
      });
    } catch (err) {
      log.warn("MCP server reconnect failed", { server: server.name, error: String(err) });
      await markSessionInactive(server.name);
      await db.exec`
        UPDATE mcp_servers SET status = 'error', updated_at = NOW() WHERE name = ${server.name}
      `;
    }
  }
}

// --- startInstalledServers ---

export async function startInstalledServers(): Promise<{
  tools: Array<MCPTool & { serverName: string }>;
  startedServers: string[];
  failedServers: string[];
}> {
  // Reconnect any previously active sessions on first call
  await reconnectPreviouslyActiveSessions();

  const servers: MCPServer[] = [];
  const rows = db.query`
    SELECT * FROM mcp_servers WHERE status = 'installed' ORDER BY name
  `;
  for await (const row of rows) {
    servers.push({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      command: row.command as string,
      args: (row.args as string[]) ?? [],
      envVars: typeof row.env_vars === "string" ? JSON.parse(row.env_vars) : (row.env_vars as Record<string, string>) ?? {},
      status: row.status as "installed",
      category: row.category as MCPServer["category"],
      config: typeof row.config === "string" ? JSON.parse(row.config) : (row.config as Record<string, unknown>) ?? {},
      configRequired: (row.config_required as boolean) ?? true,
      installedAt: (row.installed_at as Date)?.toISOString() ?? null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    });
  }

  const allTools: Array<MCPTool & { serverName: string }> = [];
  const startedServers: string[] = [];
  const failedServers: string[] = [];

  for (const server of servers) {
    // Reuse already-running client
    if (activeClients.has(server.name) && activeClients.get(server.name)!.isRunning()) {
      const existing = activeClients.get(server.name)!;
      for (const tool of existing.getTools()) {
        allTools.push({ ...tool, serverName: server.name });
      }
      startedServers.push(server.name);
      continue;
    }

    try {
      const client = new MCPClient(server.command, server.args, server.envVars, server.name, 15_000);
      await client.start();
      activeClients.set(server.name, client);
      startedServers.push(server.name);

      // Persist session state
      await markSessionActive(server.name);

      for (const tool of client.getTools()) {
        allTools.push({ ...tool, serverName: server.name });
      }

      log.info("MCP server started for routing", {
        server: server.name,
        tools: client.getTools().map(t => t.name),
      });
    } catch (err) {
      failedServers.push(server.name);
      log.warn("MCP server failed to start", { server: server.name, error: String(err) });

      await db.exec`
        UPDATE mcp_servers SET status = 'error', updated_at = NOW()
        WHERE name = ${server.name}
      `;
      await markSessionInactive(server.name);
    }
  }

  return { tools: allTools, startedServers, failedServers };
}

// --- routeToolCall ---

export async function routeToolCall(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<MCPToolCallResult> {
  const client = activeClients.get(serverName);
  if (!client || !client.isRunning()) {
    return {
      content: [{ type: "text", text: `MCP server '${serverName}' is not running` }],
      isError: true,
    };
  }

  try {
    const result = await client.callTool(toolName, args);
    log.info("MCP tool call completed", { server: serverName, tool: toolName, isError: result.isError ?? false });
    return result;
  } catch (err) {
    log.warn("MCP tool call failed", { server: serverName, tool: toolName, error: String(err) });
    return {
      content: [{ type: "text", text: `MCP tool call failed: ${String(err)}` }],
      isError: true,
    };
  }
}

// --- stopAllServers ---

export async function stopAllServers(): Promise<void> {
  const names = [...activeClients.keys()];

  for (const [name, client] of activeClients) {
    try {
      client.kill();
      log.info("MCP server stopped", { server: name });
    } catch (err) {
      log.warn("MCP server stop failed", { server: name, error: String(err) });
    }
  }

  activeClients.clear();

  // Persist: clear all session_active flags
  if (names.length > 0) {
    await db.exec`
      UPDATE mcp_servers
      SET session_active = false, last_heartbeat_at = NULL, updated_at = NOW()
      WHERE name = ANY(${names}::text[])
    `;
  }
}

// --- getActiveToolsForAI ---

export function getActiveToolsForAI(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  _mcpServer: string;
}> {
  const tools: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
    _mcpServer: string;
  }> = [];

  for (const [serverName, client] of activeClients) {
    if (!client.isRunning()) continue;
    for (const tool of client.getTools()) {
      tools.push({
        name: `mcp_${serverName}_${tool.name}`,
        description: `[MCP: ${serverName}] ${tool.description}`,
        input_schema: tool.inputSchema,
        _mcpServer: serverName,
      });
    }
  }

  return tools;
}

// --- Exposed endpoints ---

interface MCPRoutingStatusResponse {
  enabled: boolean;
  activeServers: Array<{
    name: string;
    running: boolean;
    toolCount: number;
    tools: string[];
  }>;
}

export const routingStatus = api(
  { method: "GET", path: "/mcp/routing-status", expose: true, auth: true },
  async (): Promise<MCPRoutingStatusResponse> => {
    const activeServers: MCPRoutingStatusResponse["activeServers"] = [];
    for (const [name, client] of activeClients) {
      activeServers.push({
        name,
        running: client.isRunning(),
        toolCount: client.getTools().length,
        tools: client.getTools().map(t => t.name),
      });
    }
    return { enabled: true, activeServers };
  },
);

interface MCPCallToolRequest {
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface MCPCallToolResponse {
  result: MCPToolCallResult;
}

export const callTool = api(
  { method: "POST", path: "/mcp/call-tool", expose: false },
  async (req: MCPCallToolRequest): Promise<MCPCallToolResponse> => {
    const result = await routeToolCall(req.serverName, req.toolName, req.args);
    return { result };
  },
);
