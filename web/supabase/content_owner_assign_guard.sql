-- Handing a caption to a writer is the Creative Leader's call.
--
-- The team's flow: CMO approves → graphic goes to Designers, caption goes to a
-- Content Creator, and the Creative Leader is the one who decides who carries
-- what. The graphic half had an assignment queue; the caption half had nothing
-- at all — every post kept owner "Unassigned" (45 of 50 live posts) and no
-- control anywhere could change it.
--
-- Now that a control exists, the rule goes where the UI cannot be bypassed,
-- the same split used for the expense rules (security_p12/p13) and the accept
-- gate: canAssignCaption() in lib/roleGates.ts disables the picker, this
-- refuses the write.
--
-- Only REASSIGNMENT is guarded. Creating a post already sets owner to its
-- author, and updateContent() ships the whole `data` blob on every save, so
-- the check compares old against new and stays out of the way of ordinary
-- edits — a writer saving their caption must not trip an assignment rule.
--
-- Idempotent. Rollback: content_owner_assign_guard_rollback.sql

begin;

create or replace function public.content_owner_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  old_owner text := coalesce(old.data->>'owner', '');
  new_owner text := coalesce(new.data->>'owner', '');
begin
  -- Not an assignment change: every other edit falls straight through.
  if old_owner is not distinct from new_owner then
    return new;
  end if;

  -- Service role / migrations run without an end-user JWT.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if app_role() = 'admin' or coalesce(member_role(),'') in ('Creative Leader', 'CMO') then
    return new;
  end if;

  raise exception 'เฉพาะ Creative Leader เท่านั้นที่มอบหมายคนเขียนแคปชั่นได้ (จาก "%" เป็น "%")',
    coalesce(nullif(old_owner,''), 'ไม่ระบุ'), coalesce(nullif(new_owner,''), 'ไม่ระบุ')
    using errcode = '42501';
end; $function$;

drop trigger if exists content_owner_guard_trg on public.content_posts;
create trigger content_owner_guard_trg
  before update on public.content_posts
  for each row execute function public.content_owner_guard();

commit;
