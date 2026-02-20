CREATE TABLE agent_phase_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES agent_jobs(id) ON DELETE SET NULL,
  task_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  tokens_input INT NOT NULL DEFAULT 0,
  tokens_output INT NOT NULL DEFAULT 0,
  cached_tokens INT NOT NULL DEFAULT 0,
  cost_usd DECIMAL NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  model TEXT,
  ai_calls INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_phase_metrics_task ON agent_phase_metrics(task_id);
CREATE INDEX idx_phase_metrics_job ON agent_phase_metrics(job_id);
CREATE INDEX idx_phase_metrics_phase ON agent_phase_metrics(phase);
CREATE INDEX idx_phase_metrics_created ON agent_phase_metrics(created_at);
