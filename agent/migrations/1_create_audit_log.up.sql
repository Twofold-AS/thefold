CREATE TABLE agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  action_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  success BOOLEAN,
  error_message TEXT
);

CREATE INDEX idx_audit_session ON agent_audit_log(session_id);
CREATE INDEX idx_audit_timestamp ON agent_audit_log(timestamp DESC);
CREATE INDEX idx_audit_action ON agent_audit_log(action_type);
