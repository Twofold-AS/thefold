import { api, APIError } from "encore.dev/api";
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
    installedAt: row.installed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
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

    const row = await db.queryRow<MCPServerRow>`
      UPDATE mcp_servers
      SET status = 'installed',
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
