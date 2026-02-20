CREATE TABLE agent_rate_limits (
  user_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  task_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);

CREATE INDEX idx_rate_limits_user ON agent_rate_limits(user_id);
