-- Fase I.0.a — Task-scope split (CoWork vs Designer) + project linkage
-- task_scope drives the section-split in the Tasks UI. project_id points to
-- the canonical projects.id. Existing rows are backfilled to 'cowork' since
-- Designer-scope only exists from Fase I onwards.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS task_scope TEXT DEFAULT 'cowork'
    CHECK (task_scope IN ('cowork', 'designer'));

UPDATE tasks SET task_scope = 'cowork' WHERE task_scope IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_scope ON tasks(task_scope);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id) WHERE project_id IS NOT NULL;
