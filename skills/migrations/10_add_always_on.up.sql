-- v3 skill hardening: an `always_on` flag lets specific skills opt out of
-- the low-complexity + no-keyword-match filter. Without this, high-priority
-- skills like `security` matched even on social greetings like "Hei" and
-- inflated the prompt.
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS always_on BOOLEAN NOT NULL DEFAULT FALSE;
