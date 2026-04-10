-- D27: Persistent dependency graph for diff-based context building
CREATE TABLE IF NOT EXISTS project_dependency_graph (
  repo_owner TEXT NOT NULL,
  repo_name  TEXT NOT NULL,
  graph      JSONB NOT NULL DEFAULT '{}',
  file_count INT DEFAULT 0,
  edge_count INT DEFAULT 0,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (repo_owner, repo_name)
);

-- D27: Track file hashes in project_manifests to detect changed files
ALTER TABLE project_manifests
  ADD COLUMN IF NOT EXISTS file_hashes JSONB DEFAULT '{}';
