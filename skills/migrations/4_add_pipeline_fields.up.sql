-- Pipeline execution fields
ALTER TABLE skills ADD COLUMN IF NOT EXISTS execution_phase TEXT DEFAULT 'inject';
-- Valid phases: 'pre_run' (before AI call), 'inject' (into system prompt), 'post_run' (after AI call)

ALTER TABLE skills ADD COLUMN IF NOT EXISTS priority INT DEFAULT 100;
-- Lower number = runs first within same phase

ALTER TABLE skills ADD COLUMN IF NOT EXISTS token_estimate INT DEFAULT 0;
-- Estimated tokens this skill uses in the prompt

ALTER TABLE skills ADD COLUMN IF NOT EXISTS token_budget_max INT DEFAULT 0;
-- Max tokens this skill may use. 0 = no limit

ALTER TABLE skills ADD COLUMN IF NOT EXISTS routing_rules JSONB DEFAULT '{}';
-- Auto-activation rules: { "keywords": [...], "file_patterns": [...], "labels": [...] }

ALTER TABLE skills ADD COLUMN IF NOT EXISTS parent_skill_id UUID REFERENCES skills(id);
-- Hierarchy: skill can be sub-skill of another

ALTER TABLE skills ADD COLUMN IF NOT EXISTS composable BOOLEAN DEFAULT FALSE;
-- Can this skill be combined with others in a composite run?

ALTER TABLE skills ADD COLUMN IF NOT EXISTS output_schema JSONB;
-- For pre_run/post_run: expected output format (JSON Schema)

-- Eval/scoring
ALTER TABLE skills ADD COLUMN IF NOT EXISTS success_count INT DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS failure_count INT DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS avg_token_cost DECIMAL DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS confidence_score DECIMAL DEFAULT 0.5;

-- Usage tracking
ALTER TABLE skills ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS total_uses INT DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skills_phase ON skills(execution_phase);
CREATE INDEX IF NOT EXISTS idx_skills_priority ON skills(priority);
CREATE INDEX IF NOT EXISTS idx_skills_routing ON skills USING GIN(routing_rules);
CREATE INDEX IF NOT EXISTS idx_skills_parent ON skills(parent_skill_id);

-- Update seed data with pipeline fields (1C)
UPDATE skills SET
  execution_phase = 'inject',
  priority = 10,
  routing_rules = '{"keywords": ["encore", "backend", "api", "service"]}'::jsonb,
  token_estimate = 500
WHERE name = 'Encore.ts Rules';

UPDATE skills SET
  execution_phase = 'inject',
  priority = 20,
  routing_rules = '{"file_patterns": ["*.ts", "*.tsx"]}'::jsonb,
  token_estimate = 300
WHERE name = 'TypeScript Strict';

UPDATE skills SET
  execution_phase = 'inject',
  priority = 5,
  routing_rules = '{"keywords": ["auth", "security", "password", "token", "secret"]}'::jsonb,
  token_estimate = 400
WHERE name = 'Security Awareness';

UPDATE skills SET
  execution_phase = 'post_run',
  priority = 100,
  routing_rules = '{"labels": ["documentation"]}'::jsonb,
  token_estimate = 200
WHERE name = 'Norwegian Docs';

UPDATE skills SET
  execution_phase = 'inject',
  priority = 30,
  routing_rules = '{"keywords": ["test", "testing", "coverage"]}'::jsonb,
  token_estimate = 350
WHERE name = 'Test Coverage';
