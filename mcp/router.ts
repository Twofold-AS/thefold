import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { MCPClient, MCPTool, MCPToolCallResult } from "./client";
import type { MCPServer } from "./types";
import { db } from "./db";

const MCPRoutingEnabled = secret("MCPRoutingEnabled");

// In-memory pool av aktive MCP-klienter, keyed by server name
const activeClients = new Map<string, MCPClient>();

/**
 * Start alle installerte MCP-servere for en task-sesjon.
 * Kalles fra agent context-builder.
 */
export async function startInstalledServers(): Promise<{
  tools: Array<MCPTool & { serverName: string }>;
  startedServers: string[];
  failedServers: string[];
}> {
  const enabled = MCPRoutingEnabled();
  if (enabled !== "true") {
    return { tools: [], startedServers: [], failedServers: [] };
  }

  // Hent installerte servere fra DB
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
      category: row.category as any,
      config: typeof row.config === "string" ? JSON.parse(row.config) : (row.config as Record<string, unknown>) ?? {},
      installedAt: (row.installed_at as Date)?.toISOString() ?? null,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    });
  }

  const allTools: Array<MCPTool & { serverName: string }> = [];
  const startedServers: string[] = [];
  const failedServers: string[] = [];

  for (const server of servers) {
    // Skip allerede kjørende
    if (activeClients.has(server.name) && activeClients.get(server.name)!.isRunning()) {
      const existing = activeClients.get(server.name)!;
      for (const tool of existing.getTools()) {
        allTools.push({ ...tool, serverName: server.name });
      }
      startedServers.push(server.name);
      continue;
    }

    try {
      const client = new MCPClient(
        server.command,
        server.args,
        server.envVars,
        server.name,
        15000, // 15s timeout for start
      );

      await client.start();
      activeClients.set(server.name, client);
      startedServers.push(server.name);

      for (const tool of client.getTools()) {
        allTools.push({ ...tool, serverName: server.name });
      }

      log.info("MCP server started for routing", {
        server: server.name,
        tools: client.getTools().map(t => t.name),
      });
    } catch (err) {
      failedServers.push(server.name);
      log.warn("MCP server failed to start", {
        server: server.name,
        error: String(err),
      });

      // Oppdater status til error
      await db.exec`
        UPDATE mcp_servers SET status = 'error', updated_at = NOW()
        WHERE name = ${server.name}
      `;
    }
  }

  return { tools: allTools, startedServers, failedServers };
}

/**
 * Rut et tool-kall til riktig MCP-server.
 */
export async function routeToolCall(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<MCPToolCallResult> {
  const enabled = MCPRoutingEnabled();
  if (enabled !== "true") {
    return {
      content: [{ type: "text", text: "MCP routing is disabled" }],
      isError: true,
    };
  }

  const client = activeClients.get(serverName);
  if (!client || !client.isRunning()) {
    return {
      content: [{ type: "text", text: `MCP server '${serverName}' is not running` }],
      isError: true,
    };
  }

  try {
    const result = await client.callTool(toolName, args);

    log.info("MCP tool call completed", {
      server: serverName,
      tool: toolName,
      isError: result.isError ?? false,
    });

    return result;
  } catch (err) {
    log.warn("MCP tool call failed", {
      server: serverName,
      tool: toolName,
      error: String(err),
    });

    return {
      content: [{ type: "text", text: `MCP tool call failed: ${String(err)}` }],
      isError: true,
    };
  }
}

/**
 * Stopp alle aktive MCP-servere. Kalles etter task completion.
 */
export function stopAllServers(): void {
  for (const [name, client] of activeClients) {
    try {
      client.kill();
      log.info("MCP server stopped", { server: name });
    } catch (err) {
      log.warn("MCP server stop failed", { server: name, error: String(err) });
    }
  }
  activeClients.clear();
}

/**
 * Hent aktive MCP-tools formatert for Anthropic tool_use
 */
export function getActiveToolsForAI(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  _mcpServer: string;  // Intern metadata for routing
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
        name: `mcp_${serverName}_${tool.name}`,  // Prefix for å unngå kollisjoner
        description: `[MCP: ${serverName}] ${tool.description}`,
        input_schema: tool.inputSchema,
        _mcpServer: serverName,
      });
    }
  }

  return tools;
}

// --- Exposed endpoints for monitoring ---

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
    const enabled = MCPRoutingEnabled();

    const activeServers: MCPRoutingStatusResponse["activeServers"] = [];
    for (const [name, client] of activeClients) {
      activeServers.push({
        name,
        running: client.isRunning(),
        toolCount: client.getTools().length,
        tools: client.getTools().map(t => t.name),
      });
    }

    return { enabled: enabled === "true", activeServers };
  }
);

// --- Internal endpoint for tool calls ---

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
  }
);
