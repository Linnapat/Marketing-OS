-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P8: let a member self-activate on first login
--
-- Applied to production 2026-07-17 and verified. Kept here as source of truth.
-- Supersedes the members_guard() definition in security_p5.sql — run THIS one.
--
-- WHY: `members.status` gates every owner/designer picker (OwnerSelect lists only
-- Active members), but nothing ever moved a row off "Invited". Five of six real
-- members sat at Invited, so the Creative dropdown read "No active members" and
-- work could not be assigned to anyone but the CMO. The app now flips the row on
-- first successful login (lib/auth.tsx → activateInvitedMember), and security_p5's
-- guard froze `status` for non-admins, which would have blocked exactly that.
--
-- Self-activation is safe: `status` grants no privilege — it only decides who
-- shows up in pickers — and the members_self_update RLS policy already limits a
-- non-admin to their own row. Every other status transition, and every privileged
-- column (role / access / brand_access / email), stays admin-only, so the
-- staff→admin escalation path this trigger exists to close remains closed.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.members_guard() returns trigger
  language plpgsql security definer set search_path=public as $$
begin
  if app_role()='admin' then return NEW; end if;           -- admins unrestricted

  -- self-activation on first login is the ONE status change a member may make
  if NEW.status is distinct from OLD.status
     and not (OLD.status = 'Invited' and NEW.status = 'Active') then
    raise exception 'members: non-admin may only change status from Invited to Active';
  end if;

  if NEW.access       is distinct from OLD.access
     or NEW.role         is distinct from OLD.role
     or NEW.brand_access is distinct from OLD.brand_access
     or lower(NEW.email) is distinct from lower(OLD.email) then
    raise exception 'members: non-admin may not change role/access/brand/email';
  end if;
  return NEW;
end; $$;

-- A trigger function must not be callable as an RPC (PostgREST exposes SECURITY
-- DEFINER functions in `public`). Triggers don't need the caller to hold EXECUTE.
revoke execute on function public.members_guard() from public;
revoke execute on function public.members_guard() from anon;
revoke execute on function public.members_guard() from authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ GOTCHA — app_role() reads the JWT, so in a plain SQL session (no JWT) it
--    resolves to 'staff' and this trigger blocks even a service-role edit. That
--    is deliberate (fail-closed), but it means admin maintenance from the SQL
--    Editor must assert the claim first, in the same transaction:
--      begin;
--      select set_config('request.jwt.claims','{"app_role":"admin"}', true);
--      update members set status='Active' where ...;
--      commit;
--
-- VERIFIED on prod, simulating a real staff session:
--   own row Invited → Active           → 1 row  ✅ (first login can self-activate)
--   own row access  → 'Admin'          → RAISES ✅ (escalation still closed)
-- ═══════════════════════════════════════════════════════════════════════
