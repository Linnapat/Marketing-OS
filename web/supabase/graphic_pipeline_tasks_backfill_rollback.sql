-- Undo graphic_pipeline_tasks_backfill.sql.
--
-- Removes the shoot and storyboard task rows. Safe to run because these rows
-- are DERIVED: the request still holds the shooter, the shoot date and the
-- storyboard owner, and the app rebuilds the task from them the next time that
-- request is saved (graphicAssignmentTasks → upsertGraphicTask).
--
-- Note it deletes every shoot/storyboard task, not only the ones this backfill
-- inserted — including any the app has created since. There is no marker that
-- separates them, and none is needed for the reason above. What it will NOT
-- touch is the artwork task (slot 'artwork'), the 52 rows that predate all of
-- this, or any task belonging to another module: the filter is the slot, and
-- only these two kinds of row carry it.
--
-- Anything a person has already ticked off is left alone — deleting someone's
-- completed work is not a rollback, it is data loss.

begin;

delete from tasks
where data->>'graphicSlot' in ('shoot', 'storyboard')
  and coalesce(data->>'status', '') <> 'Done'
  and coalesce(done, false) = false;

delete from schema_migrations where filename = 'graphic_pipeline_tasks_backfill.sql';

commit;
