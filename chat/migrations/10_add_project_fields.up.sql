-- Fase I.0.a — Conversation-to-project binding + scope
-- Each conversation can be bound to a project (nullable — ad-hoc chats stay
-- scope=NULL). Scope determines which tab (CoWork or Designer) the chat
-- belongs to and which tool-set the agent receives.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS scope TEXT
    CHECK (scope IN ('cowork', 'designer'));

CREATE INDEX IF NOT EXISTS idx_conversations_scope ON conversations(scope);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id) WHERE project_id IS NOT NULL;
