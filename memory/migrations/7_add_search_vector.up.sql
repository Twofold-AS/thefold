-- Add tsvector column for BM25 keyword search
ALTER TABLE memories ADD COLUMN search_vector tsvector;

-- Create GIN index for fast BM25 search
CREATE INDEX idx_memories_search_vector ON memories USING GIN (search_vector);

-- Create trigger function to auto-generate search_vector
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS TRIGGER AS $$
BEGIN
  -- Combine content (weight A), category (weight B), and tags (weight C) into search_vector
  -- Weight hierarchy: content most important (A), category medium (B), tags least (C)
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to INSERT and UPDATE
CREATE TRIGGER trig_update_search_vector
  BEFORE INSERT OR UPDATE OF content, category, tags
  ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_search_vector();

-- Backfill existing rows
UPDATE memories SET search_vector =
  setweight(to_tsvector('english', COALESCE(content, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C')
WHERE search_vector IS NULL;
