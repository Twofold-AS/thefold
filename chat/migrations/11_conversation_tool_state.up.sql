-- Fase I.0.e — Per-samtale tool-state for ChatComposer "+"-popup.
-- Lagrer hvilke verktøy som er toggled on/off, hvilke skills, modell, mode, etc.
-- JSONB-felt gir fleksibilitet for nye toggles uten migrasjoner.

CREATE TABLE IF NOT EXISTS conversation_tool_state (
  conversation_id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  tool_toggles JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_skill_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  selected_model TEXT,
  project_id UUID,
  mode TEXT NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat', 'auto', 'plan')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_tool_state_user
  ON conversation_tool_state (user_email);

CREATE INDEX IF NOT EXISTS idx_conversation_tool_state_project
  ON conversation_tool_state (project_id)
  WHERE project_id IS NOT NULL;
