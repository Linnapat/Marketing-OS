-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P5 (P1-1, increment 2: lock members)
--
-- Closes the staff→admin privilege-escalation path: members.access / role feed
-- the login hook, so a staff who can write their own members row could set
-- access='Admin' and become admin on next login. This locks members to
-- admin-only writes, still lets a user update their OWN row (so the profile
-- name edit keeps working), and adds a trigger that freezes the privileged
-- columns for non-admins.
--
-- ⚠️ ORDER MATTERS. Deploy the code change first (createMember → insert,
--    updateMember → update; PR "P1-1 members lock"). The old code used upsert,
--    which Postgres always checks against the INSERT policy — applying this SQL
--    before that deploy would break a staff member's own-profile save.
--
-- Apply in Supabase → SQL Editor after the code is live. Safe to re-run.
-- Keeps auth_admin_read_members (the login hook's SELECT) — do NOT drop it.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists staff_rw            on public.members;
drop policy if exists members_read        on public.members;
drop policy if exists members_admin_write on public.members;
drop policy if exists members_self_update on public.members;

-- staff + admin may read
create policy members_read on public.members for select
  using (auth.role()='authenticated' and app_role() in ('admin','staff'));

-- admin may insert / update / delete anyone
create policy members_admin_write on public.members for all
  using (auth.role()='authenticated' and app_role()='admin')
  with check (auth.role()='authenticated' and app_role()='admin');

-- a staff member may UPDATE only their own row (name/presence etc.)
create policy members_self_update on public.members for update
  using (auth.role()='authenticated' and app_role()='staff'
         and lower(email)=lower(auth.jwt()->>'email'))
  with check (auth.role()='authenticated' and app_role()='staff'
         and lower(email)=lower(auth.jwt()->>'email'));

-- privileged columns are immutable for non-admins (blocks self-escalation)
create or replace function public.members_guard() returns trigger
  language plpgsql security definer set search_path=public as $$
begin
  if app_role()='admin' then return NEW; end if;           -- admins unrestricted
  if NEW.access       is distinct from OLD.access
     or NEW.role         is distinct from OLD.role
     or NEW.brand_access is distinct from OLD.brand_access
     or NEW.status       is distinct from OLD.status
     or lower(NEW.email) is distinct from lower(OLD.email) then
    raise exception 'members: non-admin may not change role/access/brand/status/email';
  end if;
  return NEW;
end; $$;
drop trigger if exists members_guard_trg on public.members;
create trigger members_guard_trg before update on public.members
  for each row execute function public.members_guard();

-- members_guard is a TRIGGER function and must not be callable as an RPC.
-- PostgREST exposes SECURITY DEFINER functions in `public` at /rest/v1/rpc/…, so
-- without this the security advisor (rightly) flags it as anon/authenticated
-- executable. A trigger does NOT require the invoking user to hold EXECUTE, so
-- revoking it keeps the guard working — verified on prod: staff still can't
-- escalate, staff can still rename themselves.
revoke execute on function public.members_guard() from public;
revoke execute on function public.members_guard() from anon;
revoke execute on function public.members_guard() from authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST (sign in as a NON-admin staff member):
--   • Sidebar → Edit profile → change display name → must SAVE. ✅
--   • Settings → Users & Roles: changing someone's role/access must FAIL.
--   • devtools: supabase.from('members').update({access:'Admin'})
--       .eq('email', <your email>)  → REJECTED by the trigger.
--   • Admin (CMO): add user / edit roles / delete still work normally.
--   • Everyone can still sign in (the hook still reads members).
--
-- ROLLBACK:
--   drop trigger if exists members_guard_trg on public.members;
--   drop policy if exists members_read on public.members;
--   drop policy if exists members_admin_write on public.members;
--   drop policy if exists members_self_update on public.members;
--   create policy staff_rw on public.members for all
--     using (auth.role()='authenticated' and app_role() in ('admin','staff'))
--     with check (auth.role()='authenticated' and app_role() in ('admin','staff'));
-- ═══════════════════════════════════════════════════════════════════════
