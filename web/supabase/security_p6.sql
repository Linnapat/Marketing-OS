-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P6 (P1-1: lock the org_settings governance keys)
--
-- Applied to production 2026-07-16 and verified. Kept here as source of truth.
--
-- org_settings is a shared kv table that mixes two very different things:
--   • GOVERNANCE — approval_thresholds / approval_rules (who may approve what
--     budget), vat_rate, fiscal_year, currency, company_name, working_*,
--     date_format, timezone, brands_config, teams_config, campaign_types_config,
--     workflow_status, templates_config, notif_channels, notif_triggers.
--     All of these are edited from Settings (an admin/CMO screen) — but the old
--     staff_rw policy let ANY staff rewrite them via a direct API call, e.g.
--     lowering the budget approval threshold or changing the VAT rate.
--   • MODULE / SELF data that normal staff legitimately write:
--       creative_shoots_v2 — Creative Kitchen shoot schedule (app/graphic/page.tsx)
--       member_profiles_v1 — a user's own avatar / presence / status (Sidebar)
--
-- So: everyone reads, admin writes anything, staff writes only those two keys.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists staff_rw        on public.org_settings;
drop policy if exists org_read        on public.org_settings;
drop policy if exists org_admin_write on public.org_settings;
drop policy if exists org_staff_write on public.org_settings;

create policy org_read on public.org_settings for select
  using (auth.role()='authenticated' and app_role() in ('admin','staff'));

create policy org_admin_write on public.org_settings for all
  using (auth.role()='authenticated' and app_role()='admin')
  with check (auth.role()='authenticated' and app_role()='admin');

create policy org_staff_write on public.org_settings for all
  using (auth.role()='authenticated' and app_role()='staff'
         and key in ('creative_shoots_v2','member_profiles_v1'))
  with check (auth.role()='authenticated' and app_role()='staff'
         and key in ('creative_shoots_v2','member_profiles_v1'));

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFIED on prod as a simulated staff session:
--   read all 16 keys ✅ · write creative_shoots_v2 ✅ · write own profile ✅
--   write approval_thresholds ✗ (0 rows) · vat_rate ✗ · brands_config ✗
-- and as admin: write approval_thresholds ✅ · brands_config ✅
--
-- ⚠️ If a NEW staff-facing feature starts writing an org_settings key, add that
--    key to org_staff_write — otherwise the save fails silently-ish for staff.
--
-- ROLLBACK:
--   drop policy if exists org_read on public.org_settings;
--   drop policy if exists org_admin_write on public.org_settings;
--   drop policy if exists org_staff_write on public.org_settings;
--   create policy staff_rw on public.org_settings for all
--     using (auth.role()='authenticated' and app_role() in ('admin','staff'))
--     with check (auth.role()='authenticated' and app_role() in ('admin','staff'));
-- ═══════════════════════════════════════════════════════════════════════
