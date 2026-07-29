-- Rollback of workflow_custom_tasks.sql
--
-- Dropping the column deletes every custom row and every row rename the team
-- has made. Marker overrides and done-marks filed under a CUSTOM row's key stay
-- behind in `overrides` / `done` as harmless orphans (nothing resolves them).
alter table workflow_state drop column if exists tasks;
