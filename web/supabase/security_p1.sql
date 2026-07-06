-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P1 (ชุดเดียวจบ)
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Combines, in order:
--   1. agency_tasks.agency_email  — scope external tasks to a specific user
--   2. Auth role hook             — app_role claim (admin/staff/agency) in JWT
--   3. Production RLS             — staff/admin only on internal tables;
--                                   agency confined to their own agency_tasks
--
-- AFTER RUNNING, two dashboard steps are required:
--   a) Authentication → Hooks → "Custom Access Token" → enable
--      public.custom_access_token_hook   (otherwise everyone is 'staff')
--   b) Vercel → set NEXT_PUBLIC_REQUIRE_AUTH=true (Production) → Redeploy
--      (UI login gate; DB is enforced by this file regardless)
--
-- NOTE: users must sign out & in again after (a) for the claim to appear.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Agency task ownership ────────────────────────────────────────────
alter table agency_tasks add column if not exists agency_email text;

-- ── 2. Auth role hook: members row → app_role claim ────────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims     jsonb := event -> 'claims';
  user_email text  := lower(event -> 'claims' ->> 'email');
  m          record;
  role_out   text := 'staff';
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

-- Helper: current app role from the JWT (falls back to 'staff').
create or replace function app_role() returns text language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'app_role', ''), 'staff');
$$;

-- ── 3. Internal tables: authenticated staff/admin only; agency = no access ─
do $$
declare t text;
begin
  foreach t in array array[
    'brands','campaigns','tasks','content_posts','graphic_requests','kols',
    'budget_items','expenses','expense_requests','pnl','requests','assets',
    'workload_members','members','permissions','org_settings','workflow_tasks'
  ] loop
    -- Skip tables that don't exist yet so the block never aborts midway.
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists demo_all on %I;', t);
    execute format('drop policy if exists staff_rw on %I;', t);
    execute format($f$create policy staff_rw on %I for all
      using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
      with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));$f$, t);
  end loop;
end $$;

-- Newer tables share the same staff/admin-only policy.
do $$
declare t text;
begin
  foreach t in array array[
    'campaign_types','kol_profiles','kol_channels','kol_collaboration_history',
    'kol_rank_scores','kol_rank_weights','workflow_state'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists demo_all on %I;', t);
    execute format('drop policy if exists staff_rw on %I;', t);
    execute format($f$create policy staff_rw on %I for all
      using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
      with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));$f$, t);
  end loop;
end $$;

-- ── Agency portal: an agency user reaches ONLY their own (or unassigned) rows
drop policy if exists demo_all on agency_tasks;
drop policy if exists agency_own on agency_tasks;
drop policy if exists staff_all_agency on agency_tasks;

create policy staff_all_agency on agency_tasks for all
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

create policy agency_own on agency_tasks for all
  using (
    auth.role() = 'authenticated' and app_role() = 'agency'
    and (agency_email is null or lower(agency_email) = lower(auth.jwt() ->> 'email'))
  )
  with check (
    auth.role() = 'authenticated' and app_role() = 'agency'
    and (agency_email is null or lower(agency_email) = lower(auth.jwt() ->> 'email'))
  );

-- ═══════════════════════════════════════════════════════════════════════
-- After applying: anonymous requests read nothing; staff/admin logins reach
-- everything; an agency login reaches only its own agency_tasks rows.
-- ═══════════════════════════════════════════════════════════════════════
