-- Component registry
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                              -- 'auth', 'api', 'ui', 'util', 'config'

  -- Versjonering
  version TEXT DEFAULT '1.0.0',
  previous_version_id UUID,                   -- Lenke til forrige versjon

  -- Kode
  files JSONB NOT NULL,                       -- [{path, content, language}]
  entry_point TEXT,                            -- Hovedfil
  dependencies TEXT[] DEFAULT '{}',            -- npm-pakker

  -- Opprinnelse
  source_repo TEXT NOT NULL,                   -- Repo den ble ekstrahert fra
  source_task_id UUID,                        -- Task som opprettet den
  extracted_by TEXT DEFAULT 'thefold',         -- thefold, manual

  -- Bruk
  used_by_repos TEXT[] DEFAULT '{}',           -- Repos som bruker denne
  times_used INT DEFAULT 0,

  -- Kvalitet
  test_coverage DECIMAL,
  validation_status TEXT DEFAULT 'pending',    -- pending, validated, failed

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_components_name ON components(name);
CREATE INDEX idx_components_category ON components(category);
CREATE INDEX idx_components_source_repo ON components(source_repo);

-- Healing-log
CREATE TABLE healing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID REFERENCES components(id),
  old_version TEXT,
  new_version TEXT,
  trigger TEXT,                               -- 'update', 'bugfix', 'security'
  severity TEXT DEFAULT 'normal',             -- low, normal, high, critical
  affected_repos TEXT[] DEFAULT '{}',
  tasks_created UUID[] DEFAULT '{}',          -- Task-IDer som ble opprettet
  status TEXT DEFAULT 'pending',              -- pending, in_progress, completed, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_healing_component ON healing_events(component_id);
CREATE INDEX idx_healing_status ON healing_events(status);
