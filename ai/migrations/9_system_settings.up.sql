-- System-wide settings (Commit 14)
-- Generic key/value store used initially for the debug_mode flag that gates
-- verbose [DEBUG-*] logging. Scoped to the ai service but readable from other
-- services via ai.getDebugMode() endpoint.

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO system_settings (key, value) VALUES ('debug_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
