CREATE TABLE agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  conversation_id VARCHAR(255) NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'expired', 'resuming')),
  current_phase TEXT,
  checkpoint JSONB DEFAULT '{}',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  error TEXT,
  cost_usd DECIMAL DEFAULT 0,
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_jobs_status ON agent_jobs(status);
CREATE INDEX idx_agent_jobs_task ON agent_jobs(task_id);
CREATE INDEX idx_agent_jobs_repo ON agent_jobs(repo_owner, repo_name);
CREATE INDEX idx_agent_jobs_created ON agent_jobs(created_at);
