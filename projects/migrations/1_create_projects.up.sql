-- Fase I.0.a — Canonical projects registry
-- Central place for project metadata. Distinct from agent.project_plans
-- which is orchestrator-specific (multi-phase task decompositions).

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'code'
    CHECK (project_type IN ('code', 'framer', 'figma', 'framer_figma')),
  description TEXT,
  owner_email TEXT NOT NULL,

  -- GitHub integration
  github_repo TEXT,                   -- "thefold-team/yamaha-mt07"
  github_private BOOLEAN DEFAULT true,
  github_auto_merge BOOLEAN DEFAULT false,
  github_auto_pr BOOLEAN DEFAULT false,

  -- Framer/Figma links (credentials live in project_integrations, not here)
  framer_site_url TEXT,
  figma_file_url TEXT,

  -- Source-of-truth for hybrid projects: "repo" means git drives Framer.
  source_of_truth TEXT DEFAULT 'repo'
    CHECK (source_of_truth IN ('repo', 'framer', 'figma')),

  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Name is globally unique (shared GitHub org means repo names must not collide).
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_unique
  ON projects(name)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_email);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);
