-- Fase I.1 — Per-prosjekt integrasjoner (GitHub/Framer/Figma) + API-nøkler.
-- project_integrations holder per-plattform-metadata pr. prosjekt.
-- project_api_keys holder per-prosjekt API-nøkler (kryptert ved søyle-nivå av applikasjonen).

CREATE TABLE IF NOT EXISTS project_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('github', 'framer', 'figma')),
  remote_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_project_integrations_project
  ON project_integrations (project_id);

CREATE TABLE IF NOT EXISTS project_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  key_value_encrypted TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, key_name)
);

CREATE INDEX IF NOT EXISTS idx_project_api_keys_project
  ON project_api_keys (project_id);
