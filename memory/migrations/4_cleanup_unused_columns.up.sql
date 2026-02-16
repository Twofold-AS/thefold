-- Fjern kolonner som aldri brukes i queries
-- BEHOLDER: pinned, superseded_by, ttl_days, consolidated_from (aktivt brukt i search/cleanup/decay/consolidate)
ALTER TABLE memories DROP COLUMN IF EXISTS parent_memory_id;
ALTER TABLE memories DROP COLUMN IF EXISTS source_task_id;
