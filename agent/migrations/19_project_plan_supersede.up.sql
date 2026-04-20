ALTER TABLE project_plans
  ADD COLUMN IF NOT EXISTS master_task_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_by_project_id UUID
    REFERENCES project_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_plans_conversation_active
  ON project_plans(conversation_id)
  WHERE superseded_by_project_id IS NULL;
