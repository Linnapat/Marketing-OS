-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — shared caption templates (hashtag sets / CTAs / footers)
--
-- Saved caption building blocks moved out of each browser's localStorage into
-- org_settings under the key `caption_templates_config`, so the whole team
-- shares one library instead of every device keeping its own copy.
--
-- security_p6.sql locks org_settings per key: admin may write anything, staff
-- may write only the module/self keys listed in `org_staff_write`. Captions are
-- written by Content Creators (staff), not just the CMO, so the new key has to
-- join that list — this is exactly the case p6's closing note warns about.
-- Without it, "Save hashtag set" fails for everyone except an admin.
--
-- This only widens the staff key list; the governance keys (approval
-- thresholds, VAT, brands_config…) stay admin-only. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists org_staff_write on public.org_settings;

create policy org_staff_write on public.org_settings for all
  using (auth.role()='authenticated' and app_role()='staff'
         and key in ('creative_shoots_v2','member_profiles_v1','caption_templates_config'))
  with check (auth.role()='authenticated' and app_role()='staff'
         and key in ('creative_shoots_v2','member_profiles_v1','caption_templates_config'));

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY as a staff session after applying:
--   select set_config('request.jwt.claims', '{"role":"authenticated","member_role":"Content Creator"}', true);
--   insert into org_settings(key,label,value)
--     values('caption_templates_config','Caption Templates','{}')
--     on conflict (key) do update set value = excluded.value;   -- expect 1 row
--   update org_settings set value='{}' where key='vat_rate';    -- expect 0 rows
--
-- ROLLBACK (back to the p6 list):
--   drop policy if exists org_staff_write on public.org_settings;
--   create policy org_staff_write on public.org_settings for all
--     using (auth.role()='authenticated' and app_role()='staff'
--            and key in ('creative_shoots_v2','member_profiles_v1'))
--     with check (auth.role()='authenticated' and app_role()='staff'
--            and key in ('creative_shoots_v2','member_profiles_v1'));
-- ═══════════════════════════════════════════════════════════════════════
