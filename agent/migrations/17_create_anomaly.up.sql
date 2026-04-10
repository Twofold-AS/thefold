CREATE TABLE anomaly_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL UNIQUE,
  mean FLOAT NOT NULL DEFAULT 0,
  stddev FLOAT NOT NULL DEFAULT 1,
  sample_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL,
  expected_value FLOAT,
  actual_value FLOAT NOT NULL,
  deviation_sigmas FLOAT,
  severity TEXT NOT NULL DEFAULT 'info',
  task_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
