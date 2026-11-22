-- Rollback for security_p18_content_plan_roles.sql — removes both guards.
-- Leaves RLS exactly as it was before p18 (p18 added triggers only; it changed
-- no policy and touched no data).
begin;

drop trigger if exists content_plan_guard_trg on public.content_posts;
drop function if exists public.content_plan_guard();

drop trigger if exists app_settings_round_guard_trg on public.app_settings;
drop function if exists public.app_settings_round_guard();

commit;
