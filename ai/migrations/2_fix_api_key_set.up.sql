-- Fix: OpenAI and Moonshot don't have API keys configured
UPDATE ai_providers SET api_key_set = false WHERE slug = 'openai';
UPDATE ai_providers SET api_key_set = false WHERE slug = 'moonshot';
-- Anthropic should remain true (already correct from seed)
-- Google already has api_key_set = false and enabled = false
