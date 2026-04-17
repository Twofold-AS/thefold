-- Add encrypted_api_key column to ai_providers.
-- API keys are now stored AES-256-CBC encrypted in the DB,
-- managed from the UI at /settings/models.
-- The single encryption secret is ProviderKeyEncryptionSecret (Encore secret).

ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS encrypted_api_key TEXT;
