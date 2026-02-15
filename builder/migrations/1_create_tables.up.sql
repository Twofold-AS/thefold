-- Builder Service: builder_jobs + build_steps
-- builder_jobs tracks entire build orchestrations
-- build_steps tracks individual file operations within a job

CREATE TABLE builder_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  sandbox_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',

  -- Plan from agent
  plan JSONB NOT NULL,

  -- Build config
  build_strategy TEXT NOT NULL DEFAULT 'sequential',
  current_phase TEXT,
  current_step INT DEFAULT 0,
  total_steps INT DEFAULT 0,

  -- File tracking
  files_written JSONB DEFAULT '[]',
  files_validated JSONB DEFAULT '[]',

  -- Iterations
  build_iterations INT DEFAULT 0,
  max_iterations INT DEFAULT 10,

  -- Context
  context_window JSONB DEFAULT '{}',
  dependency_graph JSONB DEFAULT '{}',

  -- Cost tracking
  total_tokens_used INT DEFAULT 0,
  total_cost_usd DECIMAL DEFAULT 0.0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_builder_jobs_task ON builder_jobs(task_id);
CREATE INDEX idx_builder_jobs_status ON builder_jobs(status);

CREATE TABLE build_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES builder_jobs(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  phase TEXT NOT NULL,
  action TEXT NOT NULL,
  file_path TEXT,

  -- AI generation
  prompt_context JSONB,
  ai_model TEXT,
  tokens_used INT DEFAULT 0,

  -- Result
  status TEXT NOT NULL DEFAULT 'pending',
  content TEXT,
  output TEXT,
  error TEXT,

  -- Validation
  validation_result JSONB,
  fix_attempts INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_build_steps_job ON build_steps(job_id);
CREATE INDEX idx_build_steps_status ON build_steps(status);
