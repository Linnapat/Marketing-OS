-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P3 (audit hardening + fail-closed authorization)
--
-- Follow-up to security_p1.sql / security_p2.sql. Addresses the audit findings:
--   • P1-2  authorization "fails open" — an authenticated user who is NOT in
--           members still resolved to app_role='staff' (full CRUD via RLS),
--           and app_role() fell back to 'staff' whenever the JWT claim was
--           missing (e.g. the custom_access_token_hook not enabled).
--   • P2    audit_log was staff-writable with a single ALL policy, so a staff
--           user could UPDATE/DELETE audit rows and erase their own trail.
--
-- ⚠️  APPLY ON A SUPABASE BRANCH FIRST AND TEST WITH REAL LOGINS.
--     Section 2 changes how every user's role is resolved. Sign in as each
--     role (admin / staff / agency / a non-member) on the branch and confirm
--     access before merging to production. A wrong policy locks the team out.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. audit_log — make the trail tamper-evident ────────────────────────
-- Keep INSERT + SELECT for staff/admin (logging + the Settings → Audit tab
-- keep working), but grant NO update/delete policy, so RLS denies both. A
-- staff user can no longer rewrite or erase recorded events.
drop policy if exists demo_all  on audit_log;
drop policy if exists staff_rw  on audit_log;
drop policy if exists audit_insert on audit_log;
drop policy if exists audit_select on audit_log;

create policy audit_insert on audit_log for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

create policy audit_select on audit_log for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'));
-- (Optional tightening: restrict SELECT to 'admin' only if managers should not
--  read the full trail — the Settings → Audit tab would then show admins only.)

-- ── 2. Fail-closed role resolution ─────────────────────────────────────
-- Change the fallback from 'staff' (fail-open) to 'none' (fail-closed): an
-- authenticated caller whose JWT carries no app_role claim gets no access.
--
-- ⚠️ CRITICAL PREREQUISITE (2a) — the hook must be able to READ members.
-- The custom_access_token_hook runs as the `supabase_auth_admin` role, which
-- does NOT bypass RLS. The only policy on members (staff_rw) does not grant that
-- role, so at real login the hook reads ZERO members rows → every user falls to
-- the default. With the old 'staff' default that was invisible (everyone became
-- staff); flipping the default to 'none' WITHOUT this policy locks EVERYONE out
-- (all logins get app_role='none' → RLS denies → "all data disappeared").
-- This policy is the standard Supabase RBAC-hook grant and MUST exist first:
drop policy if exists auth_admin_read_members on public.members;
create policy auth_admin_read_members on public.members
  for select to supabase_auth_admin using (true);

-- Other prerequisites:
--   • custom_access_token_hook ENABLED (Auth → Hooks). (Already enabled here.)
--   • Every member signs out and back in once, so their live token carries the
--     freshly-stamped claim.
--
-- NOTE: an earlier draft resolved the role by reading members from INSIDE
-- app_role() (SECURITY DEFINER). Do NOT do that — members' own RLS policy calls
-- app_role(), so it recurses. Resolve from the JWT claim (set by the hook) only:
create or replace function app_role() returns text
  language sql stable set search_path = public as $$
  select coalesce(nullif(auth.jwt() ->> 'app_role', ''), 'none');
$$;

-- Keep the hook's own default fail-closed too, so a member removed from the
-- table can't ride an old 'staff' default.
-- ⚠️ SUPERSEDED — this copy is fail-closed but does NOT stamp `member_role`, which
--    the Finance approval rules need. security_p7.sql holds the current definition
--    and MUST be run after this file. Running this one alone silently drops the claim.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  claims     jsonb := event -> 'claims';
  user_email text  := lower(event -> 'claims' ->> 'email');
  m          record;
  role_out   text := 'none';           -- was 'staff' (fail-open) → now fail-closed
begin
  select access, brand_access, role into m
  from public.members where lower(email) = user_email limit 1;

  if found then
    if m.brand_access = 'External only' or m.role ilike '%agency%' then
      role_out := 'agency';
    elsif m.access = 'Admin' then
      role_out := 'admin';
    else
      role_out := 'staff';
    end if;
  end if;

  claims := jsonb_set(claims, '{app_role}', to_jsonb(role_out));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.members to supabase_auth_admin;

-- ── 3. (FUTURE, not activated) Per-module / per-brand scoping ───────────
-- Finding P1-1: today every 'staff' has full CRUD on every table, so the
-- Settings → Permissions matrix and brand-visibility rules are enforced only
-- in the UI. Moving them into RLS is a design task that must be rolled out and
-- tested per table on a branch. Sketch of the intended shape (DO NOT enable as-is):
--
--   -- a) surface the granular role + brand access in the JWT via the hook,
--   --    e.g. claims.app_role_detail = members.role, claims.brands = [...]
--   -- b) a SECURITY DEFINER helper: can_write(module text) that reads the
--   --    permissions table for the caller's role and returns the level.
--   -- c) per-table policies, e.g. on expenses:
--   --      using  (app_can_read('Finance'))
--   --      with check (app_can_write('Finance') and brand = any(app_brands()))
--   --    and admin-only writes on members / permissions / pnl.
--
-- Until then, keep the most sensitive tables admin-write at minimum — candidate
-- follow-up once the helper functions exist: members, permissions, pnl.
-- ═══════════════════════════════════════════════════════════════════════
