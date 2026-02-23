-- Merge templates into components table
ALTER TABLE components ADD COLUMN IF NOT EXISTS quality_score DECIMAL DEFAULT 0;
ALTER TABLE components ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'component';
ALTER TABLE components ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]';
ALTER TABLE components ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_components_type ON components(type);
CREATE INDEX IF NOT EXISTS idx_components_quality ON components(quality_score);

-- Seed TheFold's own patterns
INSERT INTO components (id, name, description, category, type, source, quality_score, tags, files, source_repo)
VALUES
  (gen_random_uuid(), 'Encore API Endpoint', 'Type-safe API endpoint pattern with request/response interfaces', 'api', 'pattern', 'seeded', 80,
   ARRAY['encore', 'api', 'typescript'],
   '[{"path":"{{SERVICE_NAME}}/{{ENDPOINT_NAME}}.ts","content":"import { api } from \"encore.dev/api\";\n\ninterface {{Name}}Request {\n  // Add request fields\n}\n\ninterface {{Name}}Response {\n  // Add response fields\n}\n\nexport const {{endpointName}} = api(\n  { method: \"POST\", path: \"/{{service}}/{{endpoint}}\", expose: true, auth: true },\n  async (req: {{Name}}Request): Promise<{{Name}}Response> => {\n    // Implementation\n    return {} as {{Name}}Response;\n  }\n);","language":"typescript"}]'::jsonb,
   'thefold'),

  (gen_random_uuid(), 'SQLDatabase + Migration', 'Database setup with migration pattern', 'database', 'pattern', 'seeded', 80,
   ARRAY['encore', 'database', 'postgresql'],
   '[{"path":"{{SERVICE_NAME}}/db.ts","content":"import { SQLDatabase } from \"encore.dev/storage/sqldb\";\n\nexport const db = new SQLDatabase(\"{{dbName}}\", { migrations: \"./migrations\" });","language":"typescript"},{"path":"{{SERVICE_NAME}}/migrations/1_create_table.up.sql","content":"CREATE TABLE {{tableName}} (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);","language":"sql"}]'::jsonb,
   'thefold'),

  (gen_random_uuid(), 'Pub/Sub Topic + Subscription', 'Event-driven messaging pattern', 'infrastructure', 'pattern', 'seeded', 80,
   ARRAY['encore', 'pubsub', 'events'],
   '[{"path":"{{SERVICE_NAME}}/events.ts","content":"import { Topic, Subscription } from \"encore.dev/pubsub\";\n\nexport interface {{Name}}Event {\n  id: string;\n  // Add event fields\n}\n\nexport const {{topicName}} = new Topic<{{Name}}Event>(\"{{topic-name}}\", {\n  deliveryGuarantee: \"at-least-once\",\n});\n\nconst _ = new Subscription({{topicName}}, \"handle-{{topic-name}}\", {\n  handler: async (event) => {\n    // Handle event\n  },\n});","language":"typescript"}]'::jsonb,
   'thefold'),

  (gen_random_uuid(), 'Feature Flag Pattern', 'Encore secret-based feature flag', 'infrastructure', 'pattern', 'seeded', 85,
   ARRAY['encore', 'feature-flag', 'secrets'],
   '[{"path":"{{SERVICE_NAME}}/flags.ts","content":"import { secret } from \"encore.dev/config\";\n\nconst {{FlagName}} = secret(\"{{FlagName}}\");\n\nexport function is{{FlagName}}Enabled(): boolean {\n  try {\n    return {{FlagName}}() === \"true\";\n  } catch {\n    return false;\n  }\n}","language":"typescript"}]'::jsonb,
   'thefold'),

  (gen_random_uuid(), 'Rate Limiter Pattern', 'Database-backed rate limiting', 'security', 'pattern', 'seeded', 85,
   ARRAY['security', 'rate-limit', 'postgresql'],
   '[{"path":"{{SERVICE_NAME}}/rate-limiter.ts","content":"import { db } from \"./db\";\nimport { APIError } from \"encore.dev/api\";\n\nexport async function checkRateLimit(userId: string, maxPerHour: number): Promise<void> {\n  const row = await db.queryRow<{ count: number }>`\n    SELECT COUNT(*) as count FROM rate_limits\n    WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL ''1 hour''\n  `;\n  if (row && row.count >= maxPerHour) {\n    throw APIError.resourceExhausted(\"Rate limit exceeded\");\n  }\n}","language":"typescript"}]'::jsonb,
   'thefold')

ON CONFLICT DO NOTHING;
