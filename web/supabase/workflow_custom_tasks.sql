-- Work Calendar — editable task rows.
--
-- Until now the rows were shipped in code (lib/data/workflow.ts) and only the
-- day markers could be edited. The team asked to add / rename / remove rows,
-- and that matters more than it used to: the calendar is the source of the
-- deadlines every other module reads, so a row nobody can add is a deadline
-- nobody can express.
--
-- Stored as one jsonb array on the same single-row table as the markers, so a
-- calendar edit stays one write.  Shape (see lib/data/calendarTasks.ts):
--   [{ key, section, en, jp, r, a, qty, note, link, custom, hidden }]
-- `key` is the row's STABLE identity — the marker overrides and done-marks are
-- filed under it, so renaming a row must not change it.
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- rollback: workflow_custom_tasks_rollback.sql

alter table workflow_state add column if not exists tasks jsonb default '[]'::jsonb;

-- No RLS change: workflow_state already carries its policy (security_p1.sql
-- narrows it to staff/admin), and this is another column on the same row.
