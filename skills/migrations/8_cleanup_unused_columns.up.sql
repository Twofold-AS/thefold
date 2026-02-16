-- Fjern marketplace-kolonner (ikke implementert)
ALTER TABLE skills DROP COLUMN IF EXISTS marketplace_id;
ALTER TABLE skills DROP COLUMN IF EXISTS marketplace_downloads;
ALTER TABLE skills DROP COLUMN IF EXISTS marketplace_rating;
ALTER TABLE skills DROP COLUMN IF EXISTS version;
ALTER TABLE skills DROP COLUMN IF EXISTS author_id;

-- Fjern ubrukte relasjons-kolonner
ALTER TABLE skills DROP COLUMN IF EXISTS depends_on;
ALTER TABLE skills DROP COLUMN IF EXISTS conflicts_with;
ALTER TABLE skills DROP COLUMN IF EXISTS parent_skill_id;

-- Fjern ubrukte meta-kolonner
ALTER TABLE skills DROP COLUMN IF EXISTS composable;
ALTER TABLE skills DROP COLUMN IF EXISTS output_schema;
ALTER TABLE skills DROP COLUMN IF EXISTS execution_phase;
ALTER TABLE skills DROP COLUMN IF EXISTS token_budget_max;
