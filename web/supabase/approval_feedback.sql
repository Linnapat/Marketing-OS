-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — approval-queue feedback log
-- Run once in Supabase → SQL Editor. Adds a feedback history column to the
-- shared approval queue so a reject / send-back reason is recorded on the
-- request (P2-1). Safe to run on an existing database.
-- ═══════════════════════════════════════════════════════════════════════

alter table requests add column if not exists feedback jsonb default '[]'::jsonb;
