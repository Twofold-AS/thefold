-- Track conversation ownership to prevent IDOR (OWASP A01:2025)
CREATE TABLE conversations (
    id VARCHAR(255) PRIMARY KEY,
    owner_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_owner ON conversations(owner_email);

-- Add context_transfer to allowed message types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('chat', 'agent_report', 'task_start', 'context_transfer'));
