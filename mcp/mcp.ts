import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { db } from "./db";
import type { MCPServer, MCPServerRow, MCPServerStatus, MCPCategory } from "./types";

// --- Row parsing ---

function parseJsonb<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val as T;
}

function parseRow(row: MCPServerRow): MCPServer {
  const args = row.args
    ? typeof row.args === "string" ? JSON.parse(row.args) : row.args
    : [];

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    command: row.command,
    args: Array.isArray(args) ? args : [],
    envVars: parseJsonb<Record<string, string>>(row.env_vars, {}),
    status: row.status as MCPServerStatus,
    category: row.category as MCPCategory,
    config: parseJsonb<Record<string, unknown>>(row.config, {}),
    configRequired: row.config_required ?? true,
    installedAt: row.installed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// --- Helpers ---

async function getServerById(id: string): Promise<MCPServerRow | null> {
  return await db.queryRow<MCPServerRow>`
    SELECT * FROM mcp_servers WHERE id = ${id}::uuid
  `;
}

// --- Endpoints ---

interface ListResponse {
  servers: MCPServer[];
}

// List all MCP servers with status
export const list = api(
  { method: "GET", path: "/mcp/list", expose: true, auth: true },
  async (): Promise<ListResponse> => {
    const servers: MCPServer[] = [];
    const rows = db.query<MCPServerRow>`
      SELECT * FROM mcp_servers ORDER BY category, name
    `;
    for await (const row of rows) {
      servers.push(parseRow(row));
    }
    return { servers };
  }
);

interface GetRequest {
  id: string;
}

interface GetResponse {
  server: MCPServer;
}

// Get a single MCP server
export const get = api(
  { method: "GET", path: "/mcp/get", expose: true, auth: true },
  async (req: GetRequest): Promise<GetResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");

    const row = await db.queryRow<MCPServerRow>`
      SELECT * FROM mcp_servers WHERE id = ${req.id}::uuid
    `;
    if (!row) throw APIError.notFound("MCP server not found");

    return { server: parseRow(row) };
  }
);

interface InstallRequest {
  id: string;
  envVars?: Record<string, string>;
  config?: Record<string, unknown>;
}

interface InstallResponse {
  server: MCPServer;
}

// Install (activate) an MCP server
export const install = api(
  { method: "POST", path: "/mcp/install", expose: true, auth: true },
  async (req: InstallRequest): Promise<InstallResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");

    const existing = await db.queryRow<MCPServerRow>`
      SELECT * FROM mcp_servers WHERE id = ${req.id}::uuid
    `;
    if (!existing) throw APIError.notFound("MCP server not found");

    if (existing.status === "installed") {
      throw APIError.failedPrecondition("server is already installed");
    }

    const envVars = req.envVars ? JSON.stringify(req.envVars) : existing.env_vars;
    const config = req.config ? JSON.stringify(req.config) : (typeof existing.config === "string" ? existing.config : JSON.stringify(existing.config ?? {}));

    // Check if server requires config and env vars have empty values
    const configRequired = existing.config_required ?? true;
    const parsedEnvVars = req.envVars
      ? req.envVars
      : parseJsonb<Record<string, string>>(existing.env_vars, {});
    const hasEmptyEnvVars = configRequired && Object.entries(parsedEnvVars).some(
      ([_, value]) => !value || value === ""
    );

    const newStatus = hasEmptyEnvVars ? "not_configured" : "installed";

    const row = await db.queryRow<MCPServerRow>`
      UPDATE mcp_servers
      SET status = ${newStatus},
          env_vars = ${envVars}::jsonb,
          config = ${config}::jsonb,
          installed_at = NOW(),
          updated_at = NOW()
      WHERE id = ${req.id}::uuid
      RETURNING *
    `;

    return { server: parseRow(row!) };
  }
);

interface UninstallRequest {
  id: string;
}

interface UninstallResponse {
  server: MCPServer;
}

// Uninstall (deactivate) an MCP server
export const uninstall = api(
  { method: "POST", path: "/mcp/uninstall", expose: true, auth: true },
  async (req: UninstallRequest): Promise<UninstallResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");

    const existing = await db.queryRow<MCPServerRow>`
      SELECT * FROM mcp_servers WHERE id = ${req.id}::uuid
    `;
    if (!existing) throw APIError.notFound("MCP server not found");

    if (existing.status === "available") {
      throw APIError.failedPrecondition("server is not installed");
    }

    const row = await db.queryRow<MCPServerRow>`
      UPDATE mcp_servers
      SET status = 'available',
          installed_at = NULL,
          updated_at = NOW()
      WHERE id = ${req.id}::uuid
      RETURNING *
    `;

    return { server: parseRow(row!) };
  }
);

interface ConfigureRequest {
  id: string;
  envVars?: Record<string, string>;
  config?: Record<string, unknown>;
}

interface ConfigureResponse {
  server: MCPServer;
}

// Update configuration for an MCP server
export const configure = api(
  { method: "POST", path: "/mcp/configure", expose: true, auth: true },
  async (req: ConfigureRequest): Promise<ConfigureResponse> => {
    if (!req.id) throw APIError.invalidArgument("id is required");

    const existing = await db.queryRow<MCPServerRow>`
      SELECT * FROM mcp_servers WHERE id = ${req.id}::uuid
    `;
    if (!existing) throw APIError.notFound("MCP server not found");

    if (req.envVars) {
      await db.exec`
        UPDATE mcp_servers SET env_vars = ${JSON.stringify(req.envVars)}::jsonb, updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }

    if (req.config) {
      await db.exec`
        UPDATE mcp_servers SET config = ${JSON.stringify(req.config)}::jsonb, updated_at = NOW()
        WHERE id = ${req.id}::uuid
      `;
    }

    const row = await db.queryRow<MCPServerRow>`
      SELECT * FROM mcp_servers WHERE id = ${req.id}::uuid
    `;

    return { server: parseRow(row!) };
  }
);

// Internal: get only installed servers (for agent)
export const installed = api(
  { method: "GET", path: "/mcp/installed", expose: false },
  async (): Promise<ListResponse> => {
    const servers: MCPServer[] = [];
    const rows = db.query<MCPServerRow>`
      SELECT * FROM mcp_servers WHERE status = 'installed' ORDER BY name
    `;
    for await (const row of rows) {
      servers.push(parseRow(row));
    }
    return { servers };
  }
);

// --- Validation ---

interface ValidateRequest {
  serverId: string;
}

interface ValidateResponse {
  status: "active" | "misconfigured" | "error";
  message: string;
}

// Validate an MCP server: check config and try to start it
export const validateServer = api(
  { method: "POST", path: "/mcp/validate", expose: true, auth: true },
  async (req: ValidateRequest): Promise<ValidateResponse> => {
    const server = await getServerById(req.serverId);
    if (!server) throw APIError.notFound("Server not found");

    // Check if all required env vars are configured (non-empty)
    const envVars = parseJsonb<Record<string, string>>(server.env_vars, {});
    const missingVars = Object.entries(envVars)
      .filter(([_, value]) => !value || value === "")
      .map(([key]) => key);

    if (missingVars.length > 0) {
      return {
        status: "misconfigured",
        message: `Missing configuration: ${missingVars.join(", ")}`,
      };
    }

    // Try to start the server and call tools/list
    try {
      const { MCPClient } = await import("./client");
      const args = server.args
        ? typeof server.args === "string" ? JSON.parse(server.args) : server.args
        : [];
      const client = new MCPClient(
        server.command,
        Array.isArray(args) ? args : [],
        envVars,
        server.name,
        15000, // 15s timeout for validation
      );
      await client.start();
      const tools = client.getTools();
      client.kill();

      // Update status to installed with discovered tools
      await db.exec`
        UPDATE mcp_servers SET status = 'installed',
          discovered_tools = ${JSON.stringify(tools)}::jsonb,
          last_health_check = NOW(),
          health_status = 'healthy'
        WHERE id = ${req.serverId}::uuid
      `;

      log.info("MCP server validated successfully", {
        server: server.name,
        toolCount: tools.length,
      });

      return { status: "active", message: `Server active with ${tools.length} tools` };
    } catch (err) {
      log.warn("MCP server validation failed", {
        server: server.name,
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

// --- Register Custom MCP Server ---

interface RegisterCustomMCPRequest {
  name: string;
  command: string;
  args?: string[];
  description?: string;
}

interface RegisterCustomMCPResponse {
  id: string;
  server: MCPServer;
}

export const registerCustomMCP = api(
  { method: "POST", path: "/mcp/register-custom", expose: true, auth: true },
  async (req: RegisterCustomMCPRequest): Promise<RegisterCustomMCPResponse> => {
    if (!req.name?.trim()) throw APIError.invalidArgument("name is required");
    if (!req.command?.trim()) throw APIError.invalidArgument("command is required");

    // Generate UUID for new server
    const { randomUUID } = await import("crypto");
    const serverId = randomUUID();

    const args = req.args && req.args.length > 0 ? JSON.stringify(req.args) : null;

    const row = await db.queryRow<MCPServerRow>`
      INSERT INTO mcp_servers (
        id,
        name,
        description,
        command,
        args,
        status,
        category,
        config_required,
        created_at,
        updated_at
      ) VALUES (
        ${serverId}::uuid,
        ${req.name.trim()},
        ${req.description || null},
        ${req.command.trim()},
        ${args}::jsonb,
        'available',
        'general',
        false,
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    if (!row) {
      throw APIError.internal("Failed to insert MCP server");
    }

    log.info("Custom MCP server registered", {
      serverId,
      name: req.name.trim(),
      command: req.command.trim(),
    });

    return { id: serverId, server: parseRow(row) };
  }
);
