-- Uploads project-scope + dedup + versioning.

-- Project-scope: coupled to projects.id via conversations.project_id.
-- Nullable for legacy rows that predate Fase I.
ALTER TABLE chat_files
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES chat_files(id) ON DELETE SET NULL;

-- Dedup lookup: "har bruker lastet opp samme zip (same hash) i samme prosjekt tidligere?"
CREATE INDEX IF NOT EXISTS idx_chat_files_dedup
  ON chat_files (user_email, project_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- Version-chain lookup: "finn latest version av filename X i prosjekt Y for bruker Z"
CREATE INDEX IF NOT EXISTS idx_chat_files_version_chain
  ON chat_files (user_email, project_id, filename, version DESC)
  WHERE superseded_by IS NULL;

-- Project-scope listing: "alle uploads i prosjektet"
CREATE INDEX IF NOT EXISTS idx_chat_files_project
  ON chat_files (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
