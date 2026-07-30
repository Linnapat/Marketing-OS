-- Rollback: Creative can accept work on any campaign again, approved or not.
begin;
drop trigger if exists graphic_accept_guard_trg on public.graphic_requests;
drop function if exists public.graphic_accept_guard();
commit;
