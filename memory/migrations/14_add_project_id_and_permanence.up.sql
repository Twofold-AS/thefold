-- Sprint A — project_id + permanence-grader på memories.
--
-- Memory blir det universelle data-laget for kunnskap:
--   * task_transient — Phase 0/N file-content + scrape-content. TTL 24h via
--     cleanup-cron som spør tasks-service om master-task er done.
--   * normal — eksisterende oppførsel (decay etter ttl_days, default 90).
--   * project_fact — stabilt prosjekt-faktum (brand color, font, layout).
--     Pinned, decay-immune, leses ved task-start for kontekst-injection.
--   * permanent — org-nivå-sannhet på tvers av prosjekter.
--
-- project_id kobler memories til prosjekt-domenet. Ingen FK fordi
-- projects-service har egen DB; validering skjer i app-laget.
-- Eksisterende rader får DEFAULT-verdier (NULL + 'normal'), ingen
-- oppførsel-endring. 100% backwards-compat.

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS project_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS permanence TEXT NOT NULL DEFAULT 'normal'
    CHECK (permanence IN ('task_transient', 'normal', 'project_fact', 'permanent'));

-- Indekser for de to vanligste lookup-mønstrene:
--   1) Hent project_facts ved task-start: WHERE project_id = X AND permanence = 'project_fact'
--   2) Hent task_transient for cleanup: WHERE permanence = 'task_transient'
CREATE INDEX IF NOT EXISTS idx_memories_project_perm
  ON memories (project_id, permanence)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_task_transient
  ON memories (created_at)
  WHERE permanence = 'task_transient';
