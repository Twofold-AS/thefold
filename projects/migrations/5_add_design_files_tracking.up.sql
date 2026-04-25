-- Sprint B — design-files-tracking på projects.
--
-- design.md + design_tokens.json genereres fra memories.permanence='project_fact'
-- ved master-task done. design_files_external_hash er SHA-256 av begge filer
-- concat'ed; brukes av sync-cron til å detect manuelle endringer i repo.
--
-- 100% backwards-compat: nullable felt, eksisterende prosjekter får DEFAULT.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS design_md_path TEXT,
  ADD COLUMN IF NOT EXISTS design_md_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_md_version INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS design_md_external_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_design_md_path
  ON projects (design_md_path)
  WHERE design_md_path IS NOT NULL;
