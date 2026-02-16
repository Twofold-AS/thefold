-- Add task_phase column for task-type filtering
-- Separate from execution_phase which controls pipeline stage (pre_run/inject/post_run)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS task_phase TEXT NOT NULL DEFAULT 'all';

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_skills_task_phase ON skills(task_phase);

-- Set meaningful defaults for existing skills
UPDATE skills SET task_phase = 'coding' WHERE name = 'TypeScript Strict';
UPDATE skills SET task_phase = 'coding' WHERE name = 'Encore.ts Rules';
UPDATE skills SET task_phase = 'all' WHERE name = 'Security Awareness';
UPDATE skills SET task_phase = 'reviewing' WHERE name = 'Norwegian Docs';
UPDATE skills SET task_phase = 'debugging' WHERE name = 'Test Coverage';
