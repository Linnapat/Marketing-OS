-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — PRODUCTION Row Level Security (template)
--
-- The demo ships with open policies (anyone with the anon key can read/write).
-- That's fine while the app is gated by Vercel Deployment Protection (only your
-- team can reach the site). Apply this file when you add Supabase Auth (real
-- logins) so the database itself enforces access — especially so the external
-- Agency role can only touch agency_tasks.
--
-- PREREQUISITE: enable Supabase Auth and give each user an app role. The
-- simplest approach is a custom JWT claim `app_role` (e.g. 'admin', 'staff',
-- 'agency') set via an auth hook, read below as auth.jwt()->>'app_role'.
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: current app role from the JWT (falls back to 'staff').
create or replace function app_role() returns text language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'app_role', ''), 'staff');
$$;

-- ── Internal tables: authenticated staff/admin read+write; agency has NO access
do $$
declare t text;
begin
  foreach t in array array[
    'brands','campaigns','tasks','content_posts','graphic_requests','kols',
    'budget_items','expenses','expense_requests','pnl','requests','assets',
    'workload_members','members','permissions','org_settings','workflow_tasks'
  ] loop
    execute format('drop policy if exists demo_all on %I;', t);
    execute format('drop policy if exists staff_rw on %I;', t);
    execute format($f$create policy staff_rw on %I for all
      using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
      with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));$f$, t);
  end loop;
end $$;

-- Finance P&L Operation costs are already gated in the UI to CMO/Admin; to also
-- enforce in the DB, split `pnl` / `budget_items` reads by app_role() = 'admin'.

-- ── Agency portal: external agency can read+write ONLY their own tasks
drop policy if exists demo_all on agency_tasks;
drop policy if exists agency_own on agency_tasks;
drop policy if exists staff_all_agency on agency_tasks;

-- staff/admin: full access
create policy staff_all_agency on agency_tasks for all
  using (app_role() in ('admin','staff'))
  with check (app_role() in ('admin','staff'));

-- agency: only rows for their assigned campaigns (add an `agency_id` column and
-- match it to the user; here we allow all agency_tasks for any agency user as a
-- starting point — tighten with: using (agency_id = auth.uid()))
create policy agency_own on agency_tasks for all
  using (app_role() = 'agency')
  with check (app_role() = 'agency');

-- ═══════════════════════════════════════════════════════════════════════
-- After applying: an agency-role user's anon/authenticated session can reach
-- ONLY agency_tasks; every internal table returns zero rows for them.
-- ═══════════════════════════════════════════════════════════════════════
