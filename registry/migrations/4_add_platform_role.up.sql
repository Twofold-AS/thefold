-- Fase I.4 — Utvide components med platform/role/framer-metadata for å støtte
-- design-komponenter fra Framer/Figma side-om-side med kode-komponenter.

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'code'
    CHECK (platform IN ('code', 'framer', 'figma')),
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS framer_component_id TEXT,
  ADD COLUMN IF NOT EXISTS figma_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_components_platform
  ON components (platform)
  WHERE platform != 'code';

UPDATE components SET platform = 'code' WHERE platform IS NULL;
