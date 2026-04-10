CREATE TABLE permission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('read', 'write', 'destructive')),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO permission_rules (action, risk_level, requires_approval, description) VALUES
  ('repo_read_file', 'read', false, 'Read file from repository'),
  ('repo_get_tree', 'read', false, 'List repository tree'),
  ('repo_write_file', 'write', false, 'Write file to sandbox'),
  ('repo_create_pr', 'write', true, 'Create pull request'),
  ('sandbox_destroy', 'destructive', false, 'Destroy sandbox environment'),
  ('memory_store', 'write', false, 'Store memory'),
  ('memory_search', 'read', false, 'Search memories');
