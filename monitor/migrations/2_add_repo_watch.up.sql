-- 8.1: Repo-watch results table
CREATE TABLE repo_watch_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo TEXT NOT NULL,
  commit_sha TEXT,
  finding_type TEXT NOT NULL, -- 'breaking_change', 'cve', 'outdated_dep', 'new_commit'
  severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warn', 'critical'
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_repo_watch_repo ON repo_watch_results(repo, created_at DESC);
CREATE INDEX idx_repo_watch_unnotified ON repo_watch_results(notified, created_at DESC);
