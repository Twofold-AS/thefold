-- .zip-upload støtte: utvide chat_files med upload-type og extracted-struktur.
-- upload_type: 'md' | 'zip' | 'image' | 'other'
-- extracted: JSONB map path → {contentType, sizeBytes, category, contentPreview}
--   full filinnhold lagres i filer-tabellen ved behov; preview er førset ~2KB per fil.

ALTER TABLE chat_files
  ADD COLUMN IF NOT EXISTS upload_type TEXT NOT NULL DEFAULT 'md'
    CHECK (upload_type IN ('md', 'zip', 'image', 'other')),
  ADD COLUMN IF NOT EXISTS extracted JSONB,
  ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Ny tabell for utpakkede filer fra .zip (full innhold).
-- Ring-begrenset: slettes når chat_files-raden slettes.
CREATE TABLE IF NOT EXISTS chat_upload_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES chat_files(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('html', 'css', 'js', 'jsx', 'tsx', 'md', 'json', 'image', 'text', 'other')),
  size_bytes BIGINT NOT NULL,
  content_base64 TEXT,
  content_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_upload_files_upload ON chat_upload_files (upload_id);
CREATE INDEX IF NOT EXISTS idx_chat_upload_files_category ON chat_upload_files (upload_id, category);
