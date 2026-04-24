-- v3 prompt architecture: SKILL.md file-based skill loader support.
-- Adds columns that a loader populates from frontmatter + a hot index for
-- the resolver's enabled+priority fetch.
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS trigger_keywords TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS project_types    TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS min_complexity   INT    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_file      TEXT   NULL;

CREATE INDEX IF NOT EXISTS idx_skills_enabled_priority
  ON skills (enabled, priority DESC)
  WHERE enabled = true;
