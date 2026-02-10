CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    conversation_id VARCHAR(255),
    linear_task_id VARCHAR(255),
    embedding vector(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memories_embedding ON memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_task ON memories(linear_task_id) WHERE linear_task_id IS NOT NULL;
