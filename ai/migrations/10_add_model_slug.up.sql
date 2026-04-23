-- U11 — short display slug for ai_models
-- Chat UI shows the slug above the message bubble (e.g. "MiniMax M2") while
-- display_name stays as the admin-facing version (e.g. "MiniMax M2P7").
-- slug is NOT UNIQUE — multiple revisions of the same model family can share
-- the same short form.

ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS slug TEXT;

-- Known models — keep in sync with seed data.
UPDATE ai_models SET slug = 'Claude Sonnet'  WHERE model_id LIKE 'claude-sonnet%' AND slug IS NULL;
UPDATE ai_models SET slug = 'Claude Haiku'   WHERE model_id LIKE 'claude-haiku%'  AND slug IS NULL;
UPDATE ai_models SET slug = 'Claude Opus'    WHERE model_id LIKE 'claude-opus%'   AND slug IS NULL;
UPDATE ai_models SET slug = 'GPT-4o'         WHERE model_id = 'gpt-4o'            AND slug IS NULL;
UPDATE ai_models SET slug = 'GPT-4o mini'    WHERE model_id = 'gpt-4o-mini'       AND slug IS NULL;
UPDATE ai_models SET slug = 'GPT-4'          WHERE model_id LIKE 'gpt-4%' AND slug IS NULL;
UPDATE ai_models SET slug = 'Gemini Pro'     WHERE model_id LIKE 'gemini-%-pro'   AND slug IS NULL;
UPDATE ai_models SET slug = 'Gemini Flash'   WHERE model_id LIKE 'gemini-%-flash' AND slug IS NULL;
UPDATE ai_models SET slug = 'MiniMax M2'     WHERE model_id LIKE '%minimax-m2%'   AND slug IS NULL;
UPDATE ai_models SET slug = 'DeepSeek V3'    WHERE model_id LIKE '%deepseek-v3%'  AND slug IS NULL;
UPDATE ai_models SET slug = 'Moonshot 128K'  WHERE model_id = 'moonshot-v1-128k'  AND slug IS NULL;
UPDATE ai_models SET slug = 'Moonshot 32K'   WHERE model_id = 'moonshot-v1-32k'   AND slug IS NULL;
UPDATE ai_models SET slug = 'Llama 3'        WHERE model_id LIKE '%llama-3%'      AND slug IS NULL;
UPDATE ai_models SET slug = 'Mixtral'        WHERE model_id LIKE '%mixtral%'      AND slug IS NULL;

-- Fallback: copy display_name for anything still NULL so frontend always has
-- something to render.
UPDATE ai_models SET slug = display_name WHERE slug IS NULL;
