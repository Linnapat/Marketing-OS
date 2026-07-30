-- Rollback: anyone who can edit a post can reassign its caption owner again.
begin;
drop trigger if exists content_owner_guard_trg on public.content_posts;
drop function if exists public.content_owner_guard();
commit;
