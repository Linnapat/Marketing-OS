-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Security P4 (P1-1, increment 1: lock the sensitive tables)
--
-- Today every 'staff' has full CRUD on every table. This tightens the tables
-- that have NO legitimate non-admin write path down to admin-only writes, while
-- keeping the staff read access the app needs. Apply in Supabase → SQL Editor.
-- Safe to re-run. Zero UX impact (no normal user writes these).
--
--   • permissions   — only Settings → Permissions (admin) writes it
--   • pnl           — never written from the app
--   • budget_items  — never written from the app
--
-- NOTE — members is deliberately NOT here. It also feeds the login hook, so a
-- staff who can write their own members row could set access='Admin' and
-- escalate — but locking it needs a paired code change first (member writes use
-- .upsert(), which Postgres always checks against the INSERT policy, so an
-- admin-only INSERT would break the profile name-edit and the admin "add user"
-- flow). That's the next increment: split member create/update into explicit
-- insert/update, add a self-update policy + a trigger that freezes
-- role/access/brand/status for non-admins, then lock members here too.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['permissions','pnl','budget_items'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists staff_rw on %I;', t);
    execute format('drop policy if exists read_staff on %I;', t);
    execute format('drop policy if exists write_admin on %I;', t);
    execute format($f$create policy read_staff on %I for select
      using (auth.role()='authenticated' and app_role() in ('admin','staff'));$f$, t);
    execute format($f$create policy write_admin on %I for all
      using (auth.role()='authenticated' and app_role()='admin')
      with check (auth.role()='authenticated' and app_role()='admin');$f$, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- TEST (sign in as a NON-admin staff member):
--   • Settings → Permissions: changing a cell must FAIL (write denied).
--   • Dashboard / Finance still load normally (reads unaffected).
--   • Admin (CMO) can still edit the Permissions matrix normally.
--
-- ROLLBACK (restore staff-writable on all three):
--   do $$ declare t text; begin
--     foreach t in array array['permissions','pnl','budget_items'] loop
--       execute format('drop policy if exists read_staff on %I;', t);
--       execute format('drop policy if exists write_admin on %I;', t);
--       execute format($f$create policy staff_rw on %I for all
--         using (auth.role()=''authenticated'' and app_role() in (''admin'',''staff''))
--         with check (auth.role()=''authenticated'' and app_role() in (''admin'',''staff''));$f$, t);
--     end loop; end $$;
-- ═══════════════════════════════════════════════════════════════════════
