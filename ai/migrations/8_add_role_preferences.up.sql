-- Add capabilities column to ai_models
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{}';

-- Create role preferences table
CREATE TABLE IF NOT EXISTS ai_model_role_preferences (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  model_id TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_preferences_unique ON ai_model_role_preferences(role, model_id);
CREATE INDEX IF NOT EXISTS idx_role_preferences_role ON ai_model_role_preferences(role, priority);
