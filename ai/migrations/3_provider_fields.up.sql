-- ZH: Add provider_model_id column for multi-provider model mapping.
-- This stores the provider-specific model ID when it differs from the
-- canonical model_id (e.g., OpenRouter uses "anthropic/claude-3.5-sonnet").

ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS provider_model_id TEXT;

-- Seed additional providers for multi-AI support.
-- These are disabled by default (ZMultiProvider feature flag controls activation).
-- api_key_set = false means no API key is configured yet.
INSERT INTO ai_providers (name, slug, base_url, api_key_set, enabled) VALUES
  ('OpenRouter', 'openrouter', 'https://openrouter.ai/api', false, false),
  ('Fireworks', 'fireworks', 'https://api.fireworks.ai/inference', false, false)
ON CONFLICT (name) DO NOTHING;
