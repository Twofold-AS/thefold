-- Extend message_type CHECK to include memory_insight
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
    'memory_insight'
  )
);
