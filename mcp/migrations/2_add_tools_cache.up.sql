-- Cache discovered tools per server for raskere oppstart
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS discovered_tools JSONB DEFAULT '[]';
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ;
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown';

-- Index for health checks
CREATE INDEX IF NOT EXISTS idx_mcp_health ON mcp_servers(health_status);
