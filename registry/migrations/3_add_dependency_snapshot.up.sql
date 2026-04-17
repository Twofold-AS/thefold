-- Add dependency snapshot and generation timestamp to components
ALTER TABLE components
ADD COLUMN IF NOT EXISTS dependency_snapshot JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_components_generated_at ON components(generated_at);
