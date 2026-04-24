-- Remove duplicate pre-seeded servers that duplicate existing services
DELETE FROM mcp_servers WHERE name IN ('github', 'postgres');

-- Add sentry and linear servers
INSERT INTO mcp_servers (name, description, command, args, category, status, env_vars, config)
VALUES
  ('sentry', 'Bug reports and error tracking', 'npx', ARRAY['-y', '@sentry/mcp-server'], 'general', 'available',
   '{"SENTRY_AUTH_TOKEN": ""}'::jsonb, '{}'::jsonb),
  ('linear-mcp', 'Read access for task import', 'npx', ARRAY['-y', '@linear/mcp-server'], 'general', 'available',
   '{"LINEAR_API_KEY": ""}'::jsonb, '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Add config_required column
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS config_required BOOLEAN DEFAULT true;

-- Mark servers that need config before activation
UPDATE mcp_servers SET config_required = true WHERE status = 'available';
