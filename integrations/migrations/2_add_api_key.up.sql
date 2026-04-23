-- Firecrawl integration + fremtidige API-key-baserte integrasjoner
-- (Brave Search, Serper, etc). Slack/Discord beholder webhook_url.
-- Key lagres kryptert (AES-256-GCM via integrations/crypto.ts, master-key AuthSecret).
-- Preview er førset 4 + siste 4 tegn (f.eks. "fc-a...bc12") — trygt for frontend.

ALTER TABLE integration_configs
  ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS api_key_preview TEXT,
  ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_status TEXT CHECK (last_test_status IN ('success', 'error', NULL));
