-- security_p18 — Content Plan and brief-round rules, moved from the UI into the
-- database.                                   ** NOT RUN — waiting for CMO approval **
--
-- Audit 22 Nov 2026 (3.2) found these rules exist only in the web app:
--
--   * app_settings is `staff_rw`: every staff account can write every key. The
--     brief-deadline switch, a round's extension and the team-holiday list are
--     gated to CMO / Creative Leader by a button, not by the database.
--   * content_posts UPDATE checks only brand_visible(): any staff role can
--     change a post's date or Publish status through PostgREST, whatever the
--     Content Plan page shows them.
--
-- Rules confirmed by the CMO (22 Nov 2026):
--   - brief deadline / "ขยายถึง" / team holidays ........ CMO, Creative Leader
--   - move a post's date directly ....................... planning side
--       (CMO, Marketing Manager / BGL, Marketing Executive, Co-ordinator)
--       plus Creative Leader, who APPROVES a date-change request — approving
--       is the write that moves the date.
--   - Content Creator asks; never moves the date.
--   - change Publish status ............................. Content Creator,
--       Creative Leader, CMO, and the planning side. Not designers, video
--       editors, KOL specialist, agency.
--
-- Why triggers and not RLS: RLS decides per ROW. A Content Creator must still
-- be able to update the post row — writing a caption and FILING a date-change
-- request are both updates to it — so the row cannot be closed to them. What
-- has to be refused is a change to particular FIELDS, which is what a trigger
-- sees (same shape as content_owner_guard, already live on this table).
--
-- Safe by construction:
--   * service_role and any non-"authenticated" caller pass (cron, fan-out,
--     server routes) — exactly as content_owner_guard does;
--   * app_role() = 'admin' passes;
--   * a member whose role cannot be read (member_role() is null) is NOT
--     blocked: locking real staff out of their work is a worse failure than
--     the gap this closes — the same call has_module() makes. Run the
--     preflight at the bottom first to see who that would be.
--
-- Idempotent. Rollback: security_p18_content_plan_roles_rollback.sql

begin;

-- ── 1. app_settings: three keys are the Creative round's, not everyone's ────

create or replace function public.app_settings_round_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  k text := coalesce(new.key, old.key);
begin
  if k not in ('brief_cutoff_day', 'brief_deadline_extensions', 'team_holidays') then
    return coalesce(new, old);
  end if;
  if auth.role() is distinct from 'authenticated' then
    return coalesce(new, old);
  end if;
  if app_role() = 'admin' or coalesce(member_role(), '') in ('CMO', 'Creative Leader') then
    return coalesce(new, old);
  end if;
  -- Re-saving the same value is not a change (a form that writes back what it
  -- read must not start failing).
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;
  raise exception 'เฉพาะ CMO / Creative Leader เท่านั้นที่แก้เดดไลน์บรีฟ การขยายรอบ และวันหยุดทีมได้ (%).', k
    using errcode = '42501';
end; $function$;

drop trigger if exists app_settings_round_guard_trg on public.app_settings;
create trigger app_settings_round_guard_trg
  before insert or update or delete on public.app_settings
  for each row execute function public.app_settings_round_guard();

-- ── 2. content_posts: who may move the date, who may change Publish ─────────

create or replace function public.content_plan_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r text;
  date_changed boolean :=
       coalesce(old.data->>'dateIso', '') is distinct from coalesce(new.data->>'dateIso', '')
    or coalesce(old.data->>'time', '')    is distinct from coalesce(new.data->>'time', '');
  publish_changed boolean :=
       coalesce(old.data->>'publishStatus', '') is distinct from coalesce(new.data->>'publishStatus', '');
begin
  if not date_changed and not publish_changed then
    return new;
  end if;
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if app_role() = 'admin' then
    return new;
  end if;
  r := member_role();
  -- Role unreadable: do not lock a real person out (see header).
  if r is null or r = '' then
    return new;
  end if;

  if date_changed and r not in (
    'CMO', 'Marketing Manager / BGL', 'Marketing Executive', 'Co-ordinator', 'Creative Leader'
  ) then
    raise exception 'role "%" แก้วันโพสต์โดยตรงไม่ได้ — ส่งคำขอเลื่อนวันให้ Creative Leader อนุมัติ', r
      using errcode = '42501';
  end if;

  if publish_changed and r not in (
    'CMO', 'Creative Leader', 'Content Creator',
    'Marketing Manager / BGL', 'Marketing Executive', 'Co-ordinator'
  ) then
    raise exception 'role "%" เปลี่ยนสถานะ Publish ไม่ได้', r
      using errcode = '42501';
  end if;

  return new;
end; $function$;

drop trigger if exists content_plan_guard_trg on public.content_posts;
create trigger content_plan_guard_trg
  before update on public.content_posts
  for each row execute function public.content_plan_guard();

commit;

-- ── Preflight (read-only) — run BEFORE the block above ──────────────────────
-- 1. Who is active and what role does the database read for them? Anyone whose
--    role is blank or not in the lists above is who the guards will (not)
--    affect — check the names look right.
--
--   select name, email, role, status from members
--   where lower(coalesce(status,'')) in ('active','invited') order by role, name;
--
-- 2. Roles outside the two lists that have changed a post's date or Publish
--    status recently would be the people this stops. changeLog names them:
--
--   select data->>'code' as code, cl->>'by' as who, cl->>'action' as action, cl->>'at' as at
--   from content_posts, jsonb_array_elements(coalesce(data->'changeLog','[]'::jsonb)) cl
--   where deleted_at is null and (cl->>'at') > '2026-10-01'
--   order by cl->>'at' desc limit 100;
