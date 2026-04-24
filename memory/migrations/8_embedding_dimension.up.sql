-- ZI: Change embedding dimension from 512 (original, Voyage) to 1536 (OpenAI text-embedding-3-small)
-- WARNING: All existing embeddings become invalid and must be re-generated via POST /memory/re-embed

-- Drop existing ivfflat index (cannot alter vector dimension with index present)
DROP INDEX IF EXISTS idx_memories_embedding;

-- Change memories embedding column from vector(512) to vector(1536)
ALTER TABLE memories ALTER COLUMN embedding TYPE vector(1536);

-- Change code_patterns embedding columns from vector(512) to vector(1536)
ALTER TABLE code_patterns ALTER COLUMN problem_embedding TYPE vector(1536);
ALTER TABLE code_patterns ALTER COLUMN solution_embedding TYPE vector(1536);

-- Nullify existing embeddings (must be re-generated with new model)
UPDATE memories SET embedding = NULL;
UPDATE code_patterns SET problem_embedding = NULL, solution_embedding = NULL;

-- Recreate ivfflat index with new dimension
-- Note: ivfflat lists=50 is appropriate for small-medium collections.
-- For larger collections (>100k), consider increasing lists or switching to HNSW.
CREATE INDEX idx_memories_embedding ON memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
