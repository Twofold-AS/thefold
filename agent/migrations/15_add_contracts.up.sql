ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS input_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS output_contracts JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS contracts_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS actual_output JSONB;
