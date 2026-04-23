-- Fase F, Commit 35 — security block fields on code_reviews
-- security_blocked defaults to false and is flipped true by the orchestrator
-- when §27.5 triggers; a superadmin override records the details and clears
-- the flag.

ALTER TABLE code_reviews
  ADD COLUMN IF NOT EXISTS security_blocked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS security_findings JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS security_override_by TEXT,
  ADD COLUMN IF NOT EXISTS security_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS security_override_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_code_reviews_security_blocked
  ON code_reviews(security_blocked)
  WHERE security_blocked = true;

-- Reference from code_reviews back to the originating project_plan (if any)
-- so the override endpoint can locate the plan without extra lookups.
ALTER TABLE code_reviews
  ADD COLUMN IF NOT EXISTS project_plan_id UUID;
