ALTER TABLE memories ADD COLUMN content_hash TEXT;
ALTER TABLE memories ADD COLUMN trust_level TEXT DEFAULT 'user' CHECK (trust_level IN ('user', 'agent', 'system'));
