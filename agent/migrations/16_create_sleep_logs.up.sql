CREATE TABLE sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  knowledge_reviewed INT DEFAULT 0,
  knowledge_archived INT DEFAULT 0,
  knowledge_promoted INT DEFAULT 0,
  knowledge_merged INT DEFAULT 0,
  cost_usd FLOAT DEFAULT 0,
  tokens_used INT DEFAULT 0,
  report JSONB,
  status TEXT DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
