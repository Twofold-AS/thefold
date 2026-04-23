-- Fase I.5 — Sync-jobs for å holde prosjekt på tvers av plattformer synkront.
-- Status-spor når source_of_truth endres (repo ↔ framer ↔ figma).

CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('repo_to_design', 'design_to_repo', 'bidirectional')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('manual', 'webhook', 'cron')),
  source_platform TEXT NOT NULL CHECK (source_platform IN ('github', 'framer', 'figma')),
  target_platform TEXT NOT NULL CHECK (target_platform IN ('github', 'framer', 'figma')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_project ON sync_jobs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs (status) WHERE status IN ('pending', 'running');
