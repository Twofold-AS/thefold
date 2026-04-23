-- Fase H, Commit 41 — new message_type for aggregated sub-agent swarm status.
-- Single upsertable chat row per parent-task; content is a JSON payload
-- rendered by the frontend's SwarmStatusMessage component.

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check CHECK (
  message_type IN (
    'chat',
    'agent_report',
    'task_start',
    'context_transfer',
    'agent_status',
    'agent_thought',
    'agent_progress',
    'memory_insight',
    'swarm_status'
  )
);

-- Index for upsert lookup by parent-task
CREATE INDEX IF NOT EXISTS idx_messages_swarm_by_conv
  ON messages(conversation_id, message_type)
  WHERE message_type = 'swarm_status';
