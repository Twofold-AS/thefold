-- Track which MCP servers should be auto-reconnected on service restart
ALTER TABLE mcp_servers
  ADD COLUMN IF NOT EXISTS session_active   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mcp_servers_session ON mcp_servers (session_active) WHERE session_active = true;
