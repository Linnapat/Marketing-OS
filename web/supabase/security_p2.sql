-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P2 (hardening follow-up to security_p1.sql)
--
-- Already applied to the production project (zxxpyknoymdlhckpchse) via MCP on
-- 2026-07-16. Kept here so the repo stays the source of truth. Safe to re-run.
--
-- Closes the gaps the Supabase security advisor flagged after P1:
--   1. app_settings still had the demo_all (using true) policy — the last table
--      readable/writable anonymously. Now staff/admin only, like every other.
--   2. kol_master_view ran SECURITY DEFINER and `anon` held table grants, so an
--      anonymous caller could read/write KOL data through the view, bypassing
--      RLS. Now runs security_invoker (querying user's RLS applies) and is
--      granted to authenticated only.
--   3. Several functions had a role-mutable search_path — pinned to `public`.
--
-- Dashboard steps that can't be scripted (do these too):
--   a) Authentication → Hooks → enable custom_access_token_hook (so admin/agency
--      roles differ from plain staff).
--   b) Authentication → Providers/Policies → enable Leaked Password Protection.
--   c) Vercel → NEXT_PUBLIC_REQUIRE_AUTH=true (Production) → Redeploy.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. app_settings — remove the last demo_all hole.
drop policy if exists demo_all on app_settings;
drop policy if exists staff_rw on app_settings;
create policy staff_rw on app_settings for all
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

-- 2. kol_master_view — respect RLS + restrict to authenticated.
alter view public.kol_master_view set (security_invoker = on);
revoke all on public.kol_master_view from anon;
grant select on public.kol_master_view to authenticated;

-- 3. Pin function search_path (no behaviour change; public is enough because
--    every reference these functions make is to public objects or pg_catalog).
alter function public.app_role() set search_path = public;
alter function public.custom_access_token_hook(event jsonb) set search_path = public;
alter function public.recompute_all_kol_ranks() set search_path = public;
alter function public.recompute_kol_rank(p_kol uuid) set search_path = public;
alter function public.touch_campaign_results() set search_path = public;
