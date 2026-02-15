CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  repo TEXT,
  status TEXT DEFAULT 'backlog',
  priority INT DEFAULT 3,
  labels TEXT[] DEFAULT '{}',
  phase TEXT,
  depends_on UUID[] DEFAULT '{}',
  source TEXT DEFAULT 'manual',
  linear_task_id TEXT,
  linear_synced_at TIMESTAMPTZ,
  healing_source_id UUID,
  estimated_complexity INT,
  estimated_tokens INT,
  planned_order INT,
  assigned_to TEXT DEFAULT 'thefold',
  build_job_id UUID,
  pr_url TEXT,
  review_id UUID,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_repo ON tasks(repo);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_source ON tasks(source);
CREATE INDEX idx_tasks_linear ON tasks(linear_task_id);
CREATE INDEX idx_tasks_priority ON tasks(priority);
