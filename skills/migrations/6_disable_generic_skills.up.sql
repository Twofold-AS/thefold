-- Disable generic seeded skills that are not specific enough to add value by default.
-- Users can re-enable them if needed.
-- Keep active: Encore.ts Rules (critical), Security Awareness (critical), TypeScript Strict (useful)

UPDATE skills SET enabled = false WHERE name = 'Norwegian Docs';
UPDATE skills SET enabled = false WHERE name = 'Test Coverage';
UPDATE skills SET enabled = false WHERE name = 'Project Conventions';
