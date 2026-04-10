CREATE TABLE webhook_configs (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id  TEXT NOT NULL,
    url         TEXT NOT NULL,
    events      TEXT[] NOT NULL DEFAULT '{}',
    secret      TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_configs_project ON webhook_configs (project_id);
CREATE INDEX idx_webhook_configs_enabled ON webhook_configs (enabled) WHERE enabled = true;

CREATE TABLE webhook_deliveries (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    webhook_id      TEXT NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    response_status INTEGER,
    response_body   TEXT,
    duration_ms     INTEGER,
    success         BOOLEAN NOT NULL DEFAULT false,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id, delivered_at DESC);
