CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_fragment TEXT NOT NULL,
  applies_to TEXT[] DEFAULT '{}',
  scope TEXT NOT NULL DEFAULT 'global',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skills_enabled ON skills(enabled);
CREATE INDEX idx_skills_applies_to ON skills USING GIN(applies_to);
CREATE INDEX idx_skills_scope ON skills(scope);
