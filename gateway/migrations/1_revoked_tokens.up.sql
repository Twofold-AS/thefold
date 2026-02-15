CREATE TABLE revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_revoked_expires ON revoked_tokens(expires_at);
