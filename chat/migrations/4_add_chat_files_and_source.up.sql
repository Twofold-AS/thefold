-- Chat file attachments
CREATE TABLE chat_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content TEXT NOT NULL,
  size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_files_conversation ON chat_files (conversation_id);

-- Add source column to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';
