-- DEL 6A: Code patterns table for cross-project learning

CREATE TABLE code_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL, -- 'bug_fix', 'optimization', 'refactoring', 'new_feature'
  source_repo TEXT NOT NULL,
  source_task_id TEXT,

  problem_description TEXT NOT NULL,
  solution_description TEXT NOT NULL,

  files_affected TEXT[] DEFAULT '{}',
  code_before TEXT,
  code_after TEXT,

  -- Effectiveness
  bugs_prevented INT DEFAULT 0,
  times_reused INT DEFAULT 0,
  confidence_score DECIMAL DEFAULT 0.5,

  -- Embeddings
  problem_embedding vector(512),
  solution_embedding vector(512),

  -- Marketplace future-proofing
  component_id UUID, -- link to future component registry

  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_code_patterns_type ON code_patterns(pattern_type);
CREATE INDEX idx_code_patterns_repo ON code_patterns(source_repo);
CREATE INDEX idx_code_patterns_tags ON code_patterns USING GIN(tags);
