-- Add task_description to code_reviews for richer PR generation (FASE 11)
ALTER TABLE code_reviews ADD COLUMN IF NOT EXISTS task_description TEXT;
