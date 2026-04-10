CREATE TABLE knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  category TEXT NOT NULL,
  context TEXT,
  source_task_id UUID,
  source_model TEXT,
  confidence FLOAT DEFAULT 0.5,
  times_applied INT DEFAULT 0,
  times_helped INT DEFAULT 0,
  times_hurt INT DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_knowledge_category ON knowledge (category);
CREATE INDEX idx_knowledge_status_confidence ON knowledge (status, confidence);
