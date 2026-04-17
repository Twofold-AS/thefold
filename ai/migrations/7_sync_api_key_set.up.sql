-- Sync api_key_set with actual encrypted_api_key presence.
-- Before this migration, api_key_set could be true while encrypted_api_key is NULL
-- (legacy state from when keys were stored as Encore secrets, not in the DB).
-- After this migration, api_key_set = true only when an encrypted key actually exists.

UPDATE ai_providers
SET api_key_set = false
WHERE encrypted_api_key IS NULL;
