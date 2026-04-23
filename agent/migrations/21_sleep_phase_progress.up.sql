-- Fase G, Commit 37 — per-phase progress for the dream widget.
-- runSleepCycle writes these as it walks through its 4 steps so the
-- /agent/sleep/status endpoint can report "Fase 2/4: Konsoliderer".

ALTER TABLE sleep_logs
  ADD COLUMN IF NOT EXISTS current_phase INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_phase_label TEXT,
  ADD COLUMN IF NOT EXISTS total_phases INT DEFAULT 4;

CREATE INDEX IF NOT EXISTS idx_sleep_logs_active
  ON sleep_logs(started_at DESC)
  WHERE status = 'running';
