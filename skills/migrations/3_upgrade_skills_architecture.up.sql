-- DEL 4A: Skills system architecture upgrade — marketplace, versioning, categories, dependencies

-- New columns on existing skills table
ALTER TABLE skills ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0.0';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS marketplace_id TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS marketplace_downloads INT DEFAULT 0;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS marketplace_rating DECIMAL;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS author_id UUID;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS conflicts_with UUID[] DEFAULT '{}';

-- New indexes
CREATE INDEX IF NOT EXISTS idx_skills_tags ON skills USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_marketplace ON skills(marketplace_id) WHERE marketplace_id IS NOT NULL;

-- Update existing seed data with new fields
UPDATE skills SET category = 'framework', tags = ARRAY['encore', 'typescript'] WHERE name = 'Encore.ts Rules';
UPDATE skills SET category = 'language', tags = ARRAY['typescript', 'quality'] WHERE name = 'TypeScript Strict';
UPDATE skills SET category = 'security', tags = ARRAY['security', 'owasp'] WHERE name = 'Security Awareness';
UPDATE skills SET category = 'style', tags = ARRAY['norwegian', 'documentation'] WHERE name = 'Norwegian Docs';
UPDATE skills SET category = 'quality', tags = ARRAY['testing', 'vitest'] WHERE name = 'Test Coverage';

-- Update applies_to to include review for Encore.ts Rules
UPDATE skills SET applies_to = ARRAY['coding', 'review'] WHERE name = 'Encore.ts Rules';
