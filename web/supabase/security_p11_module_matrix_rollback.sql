-- Rollback of security_p11_module_matrix.sql — returns Finance tables and
-- campaign creation to brand-scoped staff access (UI-only module gating).
drop policy if exists staff_read on expenses;
create policy staff_read on expenses for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
drop policy if exists staff_write on expenses;
create policy staff_write on expenses for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
drop policy if exists staff_update on expenses;
create policy staff_update on expenses for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
drop policy if exists staff_delete on expenses;
create policy staff_delete on expenses for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));

drop policy if exists staff_read on expense_requests;
drop policy if exists staff_write on expense_requests;
drop policy if exists staff_update on expense_requests;
drop policy if exists staff_delete on expense_requests;
create policy staff_rw on expense_requests for all
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

drop policy if exists staff_insert on campaigns;
create policy staff_insert on campaigns for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));

drop function if exists has_module(text, text);
drop function if exists module_level(text);
delete from schema_migrations where filename = 'security_p11_module_matrix.sql';
