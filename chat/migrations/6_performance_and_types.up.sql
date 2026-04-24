-- Performance indexes (fixes slow history loading)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_role_created
  ON messages(conversation_id, role, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_type_task
  ON messages(conversation_id, message_type, (metadata->>'taskId'));

-- Add new message_types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'chat',
    'agent_report',
    'task_start',
    'context_transfer',
    'agent_status',
    'agent_thought',
    'agent_progress'
  ));

-- Index on conversations for faster ownership lookups
CREATE INDEX IF NOT EXISTS idx_conversations_owner_created
  ON conversations(owner_email, created_at DESC);
