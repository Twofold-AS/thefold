-- Add agent_status to allowed message types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('chat', 'agent_report', 'task_start', 'context_transfer', 'agent_status'));

-- Add updated_at for heartbeat tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
