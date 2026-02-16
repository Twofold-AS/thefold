CREATE TABLE ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT,
  api_key_set BOOLEAN DEFAULT false,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES ai_providers(id),
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  input_price DECIMAL NOT NULL DEFAULT 0,
  output_price DECIMAL NOT NULL DEFAULT 0,
  context_window INT NOT NULL DEFAULT 128000,
  max_output_tokens INT DEFAULT 8192,
  tags TEXT[] DEFAULT '{}',
  tier INT DEFAULT 3,
  enabled BOOLEAN DEFAULT true,
  supports_tools BOOLEAN DEFAULT false,
  supports_vision BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, model_id)
);

-- Seed providers
INSERT INTO ai_providers (name, slug, api_key_set, enabled) VALUES
  ('Anthropic', 'anthropic', true, true),
  ('OpenAI', 'openai', true, true),
  ('Moonshot', 'moonshot', true, true),
  ('Google', 'google', false, false);

-- Seed models
INSERT INTO ai_models (provider_id, model_id, display_name, input_price, output_price, context_window, max_output_tokens, tags, tier, enabled, supports_tools) VALUES
  ((SELECT id FROM ai_providers WHERE slug = 'anthropic'), 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 3.00, 15.00, 200000, 8192, ARRAY['planning','coding','review'], 3, true, true),
  ((SELECT id FROM ai_providers WHERE slug = 'anthropic'), 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 0.80, 4.00, 200000, 8192, ARRAY['fast','cheap','review'], 2, true, true),
  ((SELECT id FROM ai_providers WHERE slug = 'anthropic'), 'claude-opus-4-5-20251101', 'Claude Opus 4.5', 15.00, 75.00, 200000, 8192, ARRAY['planning','coding','review','reasoning'], 5, true, true),
  ((SELECT id FROM ai_providers WHERE slug = 'openai'), 'gpt-4o', 'GPT-4o', 2.50, 10.00, 128000, 4096, ARRAY['coding','review'], 3, true, true),
  ((SELECT id FROM ai_providers WHERE slug = 'openai'), 'gpt-4o-mini', 'GPT-4o Mini', 0.15, 0.60, 128000, 4096, ARRAY['fast','cheap'], 1, true, true),
  ((SELECT id FROM ai_providers WHERE slug = 'moonshot'), 'moonshot-v1-128k', 'Kimi K2.5', 0.60, 2.00, 128000, 8192, ARRAY['coding','cheap','fast'], 1, true, false),
  ((SELECT id FROM ai_providers WHERE slug = 'moonshot'), 'moonshot-v1-32k', 'Kimi 32K', 0.24, 0.24, 32000, 8192, ARRAY['cheap','fast'], 1, true, false),
  ((SELECT id FROM ai_providers WHERE slug = 'google'), 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1.25, 10.00, 1000000, 8192, ARRAY['planning','coding','review'], 3, false, true),
  ((SELECT id FROM ai_providers WHERE slug = 'google'), 'gemini-2.5-flash', 'Gemini 2.5 Flash', 0.15, 0.60, 1000000, 8192, ARRAY['fast','cheap'], 1, false, true);
