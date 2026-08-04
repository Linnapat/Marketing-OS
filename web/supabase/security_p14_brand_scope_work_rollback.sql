-- Rollback for security_p14_brand_scope_work.sql
--
-- คืน tasks / kols / assets กลับไปเป็น staff_rw (ALL) แบบเดิม — คือ
-- authenticated staff/admin เห็นและแก้ได้ทุกแบรนด์
-- ⚠️ นี่คือการ "เปิดช่อง brand scope กลับ" ใช้เฉพาะกรณีที่ p14 ทำให้ระบบใช้งาน
-- ไม่ได้จริง แล้วรีบแก้ต้นเหตุตามหลัง
--
-- index ที่ p14 สร้าง (tasks_brand_idx / kols_brand_idx / assets_brand_idx)
-- ไม่ถูกลบ — ไม่มีผลด้านสิทธิ์ และมีประโยชน์กับ query ที่ filter ตาม brand อยู่แล้ว

begin;
set search_path = public;

drop policy if exists staff_read   on tasks;
drop policy if exists staff_write  on tasks;
drop policy if exists staff_update on tasks;
drop policy if exists staff_delete on tasks;
create policy staff_rw on tasks for all
  using      (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

drop policy if exists staff_read   on kols;
drop policy if exists staff_write  on kols;
drop policy if exists staff_update on kols;
drop policy if exists staff_delete on kols;
create policy staff_rw on kols for all
  using      (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

drop policy if exists staff_read   on assets;
drop policy if exists staff_write  on assets;
drop policy if exists staff_update on assets;
drop policy if exists staff_delete on assets;
create policy staff_rw on assets for all
  using      (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

delete from schema_migrations where filename = 'security_p14_brand_scope_work.sql';

commit;
