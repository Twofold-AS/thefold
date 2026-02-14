-- DEL 1A: Memory architecture upgrade — temporal decay, hierarchical context, cross-project learning

-- Nye kolonner på eksisterende memories-tabell
ALTER TABLE memories ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'general';
-- Gyldige typer: 'skill', 'task', 'session', 'error_pattern', 'decision', 'general'

ALTER TABLE memories ADD COLUMN IF NOT EXISTS parent_memory_id UUID REFERENCES memories(id);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count INT DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS relevance_score DECIMAL DEFAULT 1.0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS ttl_days INT DEFAULT 90;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS consolidated_from UUID[] DEFAULT '{}';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES memories(id);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_repo TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_task_id TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Indekser for fremtidige queries
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_temporal ON memories(created_at, relevance_score);
CREATE INDEX IF NOT EXISTS idx_memories_repo ON memories(source_repo);
CREATE INDEX IF NOT EXISTS idx_memories_parent ON memories(parent_memory_id);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN(tags);
