CREATE TABLE mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  command TEXT NOT NULL,
  args TEXT[] DEFAULT '{}',
  env_vars JSONB DEFAULT '{}',
  status TEXT DEFAULT 'available',
  category TEXT DEFAULT 'general',
  config JSONB DEFAULT '{}',
  installed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mcp_servers_status ON mcp_servers(status);
CREATE INDEX idx_mcp_servers_category ON mcp_servers(category);

-- Pre-seed known MCP servers
INSERT INTO mcp_servers (name, description, command, args, category, status) VALUES
  ('filesystem', 'Lese og skrive filer på filsystemet', 'npx', ARRAY['-y', '@modelcontextprotocol/server-filesystem'], 'code', 'available'),
  ('github', 'GitHub repo-operasjoner', 'npx', ARRAY['-y', '@modelcontextprotocol/server-github'], 'code', 'available'),
  ('postgres', 'PostgreSQL database-tilgang', 'npx', ARRAY['-y', '@modelcontextprotocol/server-postgres'], 'data', 'available'),
  ('context7', 'Oppdatert bibliotekdokumentasjon', 'npx', ARRAY['-y', '@upstash/context7-mcp'], 'docs', 'installed'),
  ('brave-search', 'Websøk via Brave', 'npx', ARRAY['-y', '@modelcontextprotocol/server-brave-search'], 'general', 'available'),
  ('puppeteer', 'Nettleser-automatisering', 'npx', ARRAY['-y', '@modelcontextprotocol/server-puppeteer'], 'general', 'available');
