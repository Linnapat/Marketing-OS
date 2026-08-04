-- security_p14 — ปิดช่อง brand scope ที่ security_p9 ทำไม่ครบ
--
-- ปัญหา (พิสูจน์ด้วย RLS probe บน production 1 ส.ค. 2569):
--   security_p9 ใส่ brand_visible() ให้ campaigns / content_posts /
--   graphic_requests / requests / expenses / expense_requests /
--   campaign_results ครบ แต่ **ไม่ได้ใส่ให้ tasks, kols, assets**
--   ทั้งสามตารางมีคอลัมน์ brand + FK ไป brands เหมือนกัน แต่ policy ยังเป็น
--   staff_rw (authenticated staff/admin = เห็นทุกแถว)
--
--   ตอน p9 ถูกเขียน สมาชิกทุกคนเป็น "All brands" ช่องนี้จึงยังไม่มีผล
--   วันนี้มีสมาชิก 2 คนเป็น "Selected brands · Teppen · Mainichi"
--   → probe ในนามของสมาชิกคนนั้นอ่านได้ 64 tasks / 12 kols / 1 asset
--     ของ omakase และ UPDATE/DELETE ได้จริง (rows=64 / rows=12)
--
-- หลักการเดียวกับ p9:
--   1) อ่าน/เขียนต้องผ่าน brand_visible(brand) — fail-CLOSED เมื่อ scope
--      อ่านไม่ออก
--   2) **ประตูหนีไฟ**: งานที่ "มอบหมายให้ตัวเอง" ต้องไม่หายไปจาก My Tasks
--      แม้จะเป็นแบรนด์นอก scope — SELECT/UPDATE จึงยอมให้เมื่อ
--      assignee = jwt_member_name() (แนวเดียวกับ expense_requests ที่ยอมให้
--      requester อ่านคำขอของตัวเองข้าม Finance View)
--      INSERT/DELETE ไม่มีประตูหนีไฟ — สร้าง/ลบงานได้เฉพาะแบรนด์ในสิทธิ์
--   3) แถวที่ brand เป็น NULL: brand_visible() คืน true ให้ admin และคน
--      "All brands" (คืนก่อนถึงขั้น lookup ชื่อแบรนด์) และคืน false ให้คน
--      ที่ถูกจำกัด — fail-closed ตามตั้งใจ
--   4) ไม่แตะ service role (bypass RLS) และไม่แตะ agency policy
--
-- idempotent: drop policy if exists ก่อน create ทุกตัว
-- rollback: security_p14_brand_scope_work_rollback.sql

begin;
set search_path = public;

-- ── tasks ─────────────────────────────────────────────────────────────────
-- เดิม: staff_rw (ALL) ไม่มี brand scope
drop policy if exists staff_rw       on tasks;
drop policy if exists staff_read     on tasks;
drop policy if exists staff_write    on tasks;
drop policy if exists staff_update   on tasks;
drop policy if exists staff_delete   on tasks;

create policy staff_read on tasks for select
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and (brand_visible(brand) or assignee = jwt_member_name())
  );

create policy staff_write on tasks for insert
  with check (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

create policy staff_update on tasks for update
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and (brand_visible(brand) or assignee = jwt_member_name())
  )
  with check (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and (brand_visible(brand) or assignee = jwt_member_name())
  );

create policy staff_delete on tasks for delete
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

-- ── kols ──────────────────────────────────────────────────────────────────
-- kols เก็บ rate/ค่าตัวรายดีล = ข้อมูลเชิงพาณิชย์ ต้อง scope เท่ากับ campaigns
-- ประตูหนีไฟ: owner (KOL Specialist ที่ดูแลดีลนั้น) ยังอ่าน/แก้ของตัวเองได้
drop policy if exists staff_rw       on kols;
drop policy if exists staff_read     on kols;
drop policy if exists staff_write    on kols;
drop policy if exists staff_update   on kols;
drop policy if exists staff_delete   on kols;

create policy staff_read on kols for select
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and (brand_visible(brand) or owner = jwt_member_name())
  );

create policy staff_write on kols for insert
  with check (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

create policy staff_update on kols for update
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and (brand_visible(brand) or owner = jwt_member_name())
  )
  with check (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and (brand_visible(brand) or owner = jwt_member_name())
  );

create policy staff_delete on kols for delete
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

-- ── assets ────────────────────────────────────────────────────────────────
-- assets มาจาก graphic_requests ที่ถูก approve (assets_from_graphic.sql)
-- ต้นทาง scope แล้ว ปลายทางต้อง scope ตาม ไม่งั้นลิงก์ Drive/Canva ของ
-- แบรนด์อื่นหลุด
drop policy if exists staff_rw       on assets;
drop policy if exists staff_read     on assets;
drop policy if exists staff_write    on assets;
drop policy if exists staff_update   on assets;
drop policy if exists staff_delete   on assets;

create policy staff_read on assets for select
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

create policy staff_write on assets for insert
  with check (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

create policy staff_update on assets for update
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  )
  with check (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

create policy staff_delete on assets for delete
  using (
    auth.role() = 'authenticated'
    and app_role() in ('admin','staff')
    and brand_visible(brand)
  );

-- ── index รองรับ predicate brand ที่เพิ่งกลายเป็น hot path ────────────────
create index if not exists tasks_brand_idx  on tasks  (brand);
create index if not exists kols_brand_idx   on kols   (brand);
create index if not exists assets_brand_idx on assets (brand);

select record_migration(
  'security_p14_brand_scope_work.sql',
  'brand scope สำหรับ tasks/kols/assets ที่ p9 ตกหล่น'
);

commit;
