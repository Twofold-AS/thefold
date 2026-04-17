-- Add archived status to conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(owner_email, archived);
