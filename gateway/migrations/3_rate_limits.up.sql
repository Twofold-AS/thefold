-- Fase J.6 — Global + per-endpoint rate-limiting (PG-basert, ingen Redis).
-- Holder tellere pr. (user_id, bucket) hvor bucket er en fixed-window-nøkkel.
-- bucket_start_ts er sekund-presise windows (floor(epoch / window_seconds)).

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  bucket_start_ts BIGINT NOT NULL,
  count INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, bucket, bucket_start_ts)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_ts
  ON rate_limit_counters (bucket_start_ts);

-- Cleanup: cron sletter rader med bucket_start_ts eldre enn 1 time.
