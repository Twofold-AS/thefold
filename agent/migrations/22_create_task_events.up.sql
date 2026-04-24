-- Task Execution Log — persists agent events per task so the UI can show
-- a complete retrospective timeline after a run. Subscriber in task-log.ts
-- listens on agentEventBus per-task and UPSERTs rows here. Data is auth-
-- gated by user_email on read.
CREATE TABLE IF NOT EXISTS agent_task_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       TEXT NOT NULL,
  user_email    TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  phase         TEXT,
  tool_name     TEXT,
  sub_agent_role TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline fetches sort by created_at for a given task — index covers it.
CREATE INDEX IF NOT EXISTS idx_task_events_task
  ON agent_task_events (task_id, created_at);

-- Quick per-user lookup for cross-task listings (optional; cheap).
CREATE INDEX IF NOT EXISTS idx_task_events_user
  ON agent_task_events (user_email, created_at DESC);
