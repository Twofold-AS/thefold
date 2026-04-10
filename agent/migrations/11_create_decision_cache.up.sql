CREATE TABLE decision_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  pattern_regex TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5,
  strategy TEXT NOT NULL DEFAULT 'standard',
  skip_confidence BOOLEAN NOT NULL DEFAULT false,
  skip_complexity BOOLEAN NOT NULL DEFAULT false,
  preferred_model TEXT,
  plan_template JSONB,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decision_cache_confidence ON decision_cache (confidence DESC);
