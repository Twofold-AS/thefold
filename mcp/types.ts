export type MCPServerStatus = "available" | "installed" | "error";
export type MCPCategory = "general" | "code" | "data" | "docs" | "ai";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[];
  envVars: Record<string, string>;
  status: MCPServerStatus;
  category: MCPCategory;
  config: Record<string, unknown>;
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MCPServerRow {
  id: string;
  name: string;
  description: string | null;
  command: string;
  args: string[] | string | null;
  env_vars: string | Record<string, string> | null;
  status: string;
  category: string;
  config: string | Record<string, unknown> | null;
  installed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  discovered_tools: string | Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> | null;
  last_health_check: Date | null;
  health_status: string | null;
}
