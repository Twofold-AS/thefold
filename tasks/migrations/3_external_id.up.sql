ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_source TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external ON tasks(external_source, external_id) WHERE external_id IS NOT NULL;
