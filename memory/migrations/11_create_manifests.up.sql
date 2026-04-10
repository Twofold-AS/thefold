CREATE TABLE project_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  summary TEXT,
  tech_stack TEXT[] DEFAULT '{}',
  services JSONB DEFAULT '[]',
  data_models JSONB DEFAULT '[]',
  contracts JSONB DEFAULT '[]',
  conventions TEXT,
  known_pitfalls TEXT,
  file_count INT,
  last_analyzed_at TIMESTAMPTZ,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_owner, repo_name)
);
