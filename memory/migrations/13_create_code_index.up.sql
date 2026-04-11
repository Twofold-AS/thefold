-- Code index for semantic codebase search (FASE 10)
-- Stores per-file embeddings for natural-language code search

CREATE TABLE IF NOT EXISTS code_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_snippet TEXT NOT NULL,
  embedding vector(1536),
  commit_hash TEXT NOT NULL,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one entry per repo+file
CREATE UNIQUE INDEX IF NOT EXISTS code_index_repo_file ON code_index (repo_name, file_path);

-- Index for fast repo queries
CREATE INDEX IF NOT EXISTS code_index_repo_name ON code_index (repo_name);

-- Track last indexed commit per repo for incremental indexing
CREATE TABLE IF NOT EXISTS code_index_meta (
  repo_name TEXT PRIMARY KEY,
  commit_hash TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
