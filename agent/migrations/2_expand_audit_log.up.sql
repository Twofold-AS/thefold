ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS confidence_score INT;
ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS repo_name TEXT;
ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS task_id TEXT;
ALTER TABLE agent_audit_log ADD COLUMN IF NOT EXISTS duration_ms INT;

CREATE INDEX IF NOT EXISTS idx_audit_task ON agent_audit_log(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_repo ON agent_audit_log(repo_name);
CREATE INDEX IF NOT EXISTS idx_audit_user ON agent_audit_log(user_id);
