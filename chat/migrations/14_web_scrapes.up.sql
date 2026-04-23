-- Persistence for Firecrawl-scraped pages.
-- Cache keyed by (user_email, project_id, url_hash) + TTL.
-- Lives in chat DB since project_id resolves via conversations.

CREATE TABLE IF NOT EXISTS web_scrapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  project_id UUID,
  conversation_id TEXT,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,           -- SHA-256 av URL, for rask lookup
  content_md TEXT NOT NULL,
  title TEXT,
  links JSONB,
  word_count INT,
  content_hash TEXT,                -- SHA-256 av content_md, for change-detection
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_web_scrapes_user_project
  ON web_scrapes (user_email, project_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_scrapes_url_hash
  ON web_scrapes (url_hash, expires_at DESC);

-- Non-partial index: Postgres krever IMMUTABLE functions i partial-index-predicates.
-- NOW() er STABLE (én verdi pr. transaksjon, men endrer seg mellom transaksjoner),
-- derfor ikke lovlig i WHERE her. Cleanup-queryer bruker expires_at uansett, så
-- full B-tree-index gir samme effekt.
CREATE INDEX IF NOT EXISTS idx_web_scrapes_expiry
  ON web_scrapes (expires_at);
