CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    message_type VARCHAR(30) NOT NULL DEFAULT 'chat'
      CHECK (message_type IN ('chat', 'agent_report', 'task_start')),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conv_time ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_type ON messages(message_type) WHERE message_type != 'chat';
