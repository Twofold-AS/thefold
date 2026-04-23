-- Fase I.2 — Design-imports fra Framer/Figma/HTML-eksport.
-- Lagrer rå innhold + parsed DesignIR som JSONB.

CREATE TABLE IF NOT EXISTS design_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('framer', 'figma', 'html', 'unknown')),
  raw_html TEXT,
  design_ir JSONB NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_imports_project ON design_imports (project_id);
CREATE INDEX IF NOT EXISTS idx_design_imports_created ON design_imports (created_at DESC);
