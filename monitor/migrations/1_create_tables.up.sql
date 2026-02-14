-- DEL 5B: Monitor service database

CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo TEXT NOT NULL,
  check_type TEXT NOT NULL, -- 'dependency_audit', 'test_coverage', 'code_quality', 'doc_freshness'
  status TEXT NOT NULL, -- 'pass', 'warn', 'fail'
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE health_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type TEXT NOT NULL,
  threshold JSONB NOT NULL, -- e.g. { "min_coverage": 70, "max_high_vulns": 0 }
  enabled BOOLEAN DEFAULT TRUE,
  notify BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_health_checks_repo ON health_checks(repo, created_at);
CREATE INDEX idx_health_checks_type ON health_checks(check_type);
