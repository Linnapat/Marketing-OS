-- ── Push the Permissions matrix down into RLS ────────────────────────────
--
-- RLS distinguished three roles: admin | staff | agency. The app promises ten
-- roles across seven modules, so every module rule — "Creative cannot create
-- campaigns", "no Finance access", "Content Creator has no KOL" — lived only in
-- the browser. Anyone who could sign in could read or write any module by
-- calling the REST API directly. lib/roleGates.ts says as much in its header.
--
-- The matrix already exists in `permissions` (17 roles × 7 modules, levels
-- — | View | Edit | Approve | Admin). This makes the database read the same
-- table the UI reads, so there is one answer instead of two.
--
-- ── What this file does and does NOT gate ───────────────────────────────
-- GATED here: expenses / expense_requests (Finance) and campaign creation
-- (Campaign ≥ Edit). Both have a clean rule and no cross-module writer.
--
-- NOT gated here, deliberately: content_posts, graphic_requests, kols.
-- Automation crosses module lines on those tables — approving artwork writes
-- the asset onto the Content post (syncApprovedAssetsToContent), and the matrix
-- gives Creative only Content=View. Gating writes there would break asset
-- delivery for the people who deliver it. Closing that needs the cross-module
-- writers to run through a defined path first; until then those tables keep
-- brand-scoped staff access and their UI gates.
--
-- Lockout safety: a member whose role has no matrix row is NOT denied — it
-- keeps the old staff-level access. Locking real staff out of their own work is
-- a worse failure than the gap this closes. All 9 live members match a row
-- (verified 2026-07-29), so this is a safety net, not the normal path.
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- rollback: security_p11_module_matrix_rollback.sql

-- ── level lookup ─────────────────────────────────────────────────────────
create or replace function module_level(p_module text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select e->>'level' from permissions p
    cross join lateral jsonb_array_elements(p.perms) e
    where p.role = member_role() and e->>'module' = p_module
    limit 1), '');
$$;

create or replace function has_module(p_module text, p_min text default 'View')
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rank_of constant jsonb := '{"—":0,"View":1,"Edit":2,"Approve":3,"Admin":4}'::jsonb;
  lvl text := module_level(p_module);
begin
  if app_role() = 'admin' then return true; end if;
  if lvl = '' then return app_role() = 'staff'; end if;   -- see lockout note above
  return coalesce((rank_of->>lvl)::int, 0) >= coalesce((rank_of->>p_min)::int, 1);
end; $$;

revoke execute on function module_level(text) from anon;
revoke execute on function has_module(text, text) from anon;

-- ── Finance: expenses ────────────────────────────────────────────────────
drop policy if exists staff_read on expenses;
create policy staff_read on expenses for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff')
         and brand_visible(brand) and has_module('Finance','View'));
drop policy if exists staff_write on expenses;
create policy staff_write on expenses for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff')
              and brand_visible(brand) and has_module('Finance','Edit'));
drop policy if exists staff_update on expenses;
create policy staff_update on expenses for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff')
         and brand_visible(brand) and has_module('Finance','Edit'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff')
              and brand_visible(brand) and has_module('Finance','Edit'));
drop policy if exists staff_delete on expenses;
create policy staff_delete on expenses for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff')
         and brand_visible(brand) and has_module('Finance','Edit'));

-- ── Finance: expense_requests ────────────────────────────────────────────
-- Split from the single ALL policy. Raising and progressing a REQUEST needs
-- only Finance=View: asking for money is not editing the books, and Marketing
-- Manager / BGL sits at View — requiring Edit here would have stopped them
-- raising or submitting a request at all, breaking the flow for no security
-- gain, since the sensitive part is READING amounts and that is now gated.
-- The ledger itself (expenses, above) still requires Edit.
drop policy if exists staff_rw on expense_requests;
drop policy if exists staff_read on expense_requests;
create policy staff_read on expense_requests for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and has_module('Finance','View'));
drop policy if exists staff_write on expense_requests;
create policy staff_write on expense_requests for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and has_module('Finance','View'));
drop policy if exists staff_update on expense_requests;
create policy staff_update on expense_requests for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and has_module('Finance','View'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and has_module('Finance','View'));
drop policy if exists staff_delete on expense_requests;
create policy staff_delete on expense_requests for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and has_module('Finance','Edit'));

-- ── Campaign creation ────────────────────────────────────────────────────
-- The rule the UI already enforces and unit-tests (Campaign ≥ Edit), now true
-- of the database too. Reading and updating campaigns is untouched: every role
-- in the matrix has at least View, and the status guard already governs the
-- status transitions that matter.
drop policy if exists staff_insert on campaigns;
create policy staff_insert on campaigns for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff')
              and brand_visible(brand) and has_module('Campaign','Edit'));

select record_migration('security_p11_module_matrix.sql', 'Finance + campaign-create gated by the permissions matrix');
