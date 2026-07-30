-- Rollback for graphic_brief_patch.sql.
-- After this the Brief tab's save fails (the RPC is gone); the UI falls back to
-- read-only, which is the behaviour that existed before the feature.

begin;
drop function if exists public.graphic_brief_patch(text, jsonb);
commit;
