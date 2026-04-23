-- Fase F, Commit 36 — suppression audit log
-- Records every `// thefold-security-ignore CWE-XX: reason` suppression that
-- silenced a scanner finding, plus manual superadmin overrides applied via
-- /agent/review/override-security.

CREATE TABLE IF NOT EXISTS security_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_hash TEXT NOT NULL,
  cwe TEXT,
  rule_id TEXT,
  file TEXT NOT NULL,
  line INT NOT NULL,
  reason TEXT NOT NULL,
  suppressed_by TEXT NOT NULL, -- email or "inline-comment"
  source TEXT NOT NULL DEFAULT 'inline',  -- 'inline' | 'manual_override'
  suppressed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppressions_hash ON security_suppressions(finding_hash);
CREATE INDEX IF NOT EXISTS idx_suppressions_file ON security_suppressions(file);
