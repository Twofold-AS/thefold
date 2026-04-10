CREATE TABLE routing_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_hash TEXT NOT NULL UNIQUE,
  task_keywords TEXT[] DEFAULT '{}',
  file_patterns TEXT[] DEFAULT '{}',
  label_patterns TEXT[] DEFAULT '{}',
  specialist TEXT NOT NULL,
  model_recommendation TEXT,
  confidence FLOAT DEFAULT 0.5,
  hit_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE task_type_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL UNIQUE,
  typical_files TEXT[] DEFAULT '{}',
  typical_model TEXT,
  typical_complexity FLOAT,
  common_pitfalls TEXT[] DEFAULT '{}',
  average_tokens INT DEFAULT 0,
  average_retries FLOAT DEFAULT 0,
  sample_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
