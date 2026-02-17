-- Re-add columns that were accidentally dropped by the original migration 4.
-- Migration 4 was later corrected to only drop parent_memory_id + source_task_id,
-- but if the original version ran first, these 4 columns are gone from the DB.
-- Using IF NOT EXISTS to be idempotent (safe if columns already exist).

ALTER TABLE memories ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES memories(id);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS ttl_days INT DEFAULT 90;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS consolidated_from UUID[] DEFAULT '{}';
