-- Add repo_owner column to code_reviews for dynamic owner resolution
ALTER TABLE code_reviews ADD COLUMN IF NOT EXISTS repo_owner TEXT;
