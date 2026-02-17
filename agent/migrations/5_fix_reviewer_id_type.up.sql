-- reviewer_id was UUID but stores email (auth identifier), not a UUID
ALTER TABLE code_reviews ALTER COLUMN reviewer_id TYPE TEXT;
