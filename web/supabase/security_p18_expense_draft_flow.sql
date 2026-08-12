-- security_p18 — ปลดล็อกวงจร "Draft เบิกงบจากแคมเปญ" ที่ p12 ปิดตายไว้โดยไม่ตั้งใจ
--
-- p12 เขียน INSERT policy สำหรับ "ฟอร์มส่งคำขอ" อย่างเดียว: แถวใหม่ต้องเป็น
-- ('Waiting Approval', requester = คนล็อกอิน) ผลที่เจอจริง (12 ส.ค. 2569,
-- Postgres log: "new row violates row-level security policy for table
-- expense_requests" ตอน CMO กด Approve แคมเปญ CAM-2026-4064):
--
--   * Approve แคมเปญแล้วระบบเปิด Draft ตามงบ → โดนปัดตกทุกครั้ง
--     (แถวเกิดเป็น status='Draft' และ requester = planner ไม่ใช่คนกด Approve)
--   * ฟอร์ม Expenses เองก็ตก เพราะ client insert แถวแรกโดยยังไม่ใส่ requester
--     (ไปเติมใน update ที่สอง) — NULL = jwt_member_name() ไม่มีวันจริง
--     (ฝั่ง client แก้แล้วให้ส่ง requester ตั้งแต่ insert; policy นี้คงเงื่อนไขเดิมไว้)
--   * Draft ที่เปิดได้แล้ว เจ้าของกด "ส่งเข้า Approval" ไม่ได้อยู่ดี เพราะ UPDATE
--     ทั้งตารางถูกกันไว้ที่ Finance ≥ Approve (CMO) เท่านั้น
--
-- กติกาที่คงไว้ตาม p12 ทุกข้อ: แถวเกิดใหม่ห้ามเป็นอนุมัติแล้ว (approved ต้องเป็น 0,
-- status ได้แค่ Draft/Waiting Approval) และการอนุมัติ (status='Approved' + เงิน)
-- ยังทำได้เฉพาะ Finance ≥ Approve ผ่าน staff_update + RPC ที่เช็ค CMO ในตัว
--
-- Idempotent. Rollback: security_p18_expense_draft_flow_rollback.sql

begin;

-- ── 1. INSERT: เพิ่มสองกรณีที่ p12 มองข้าม ────────────────────────────────────
drop policy if exists staff_write on public.expense_requests;
create policy staff_write on public.expense_requests for insert
with check (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and brand_visible(brand)
  and coalesce(approved, 0) = 0
  and (
    -- ส่งคำขอเอง (ฟอร์ม Expenses) หรือระบบเปิด Draft ให้ตอนที่ตัวเองเป็น planner
    (requester = jwt_member_name() and coalesce(status, '') in ('Waiting Approval', 'Draft'))
    -- ผู้อนุมัติ (Finance ≥ Approve = CMO) กด Approve แคมเปญ → เปิด Draft แทน planner
    or (has_module('Finance', 'Approve') and coalesce(status, '') = 'Draft')
  )
);

-- ── 2. UPDATE: เจ้าของขยับ Draft ของตัวเองได้ — แก้รายละเอียด หรือส่งเข้าคิว ──
-- Permissive OR กับ staff_update เดิม: CMO ยังอนุมัติ/ตีกลับได้ตามเดิม ส่วนเจ้าของ
-- แตะได้เฉพาะแถว Draft ของตัวเอง และผลลัพธ์ต้องยังเป็นของตัวเอง เงินอนุมัติเป็น 0
-- และสถานะไปได้ไกลสุดแค่ Waiting Approval — เส้นทางสู่ Approved ยังเป็นของ CMO
drop policy if exists requester_draft_update on public.expense_requests;
create policy requester_draft_update on public.expense_requests for update
using (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and requester = jwt_member_name()
  and coalesce(status, '') = 'Draft'
)
with check (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and requester = jwt_member_name()
  and coalesce(status, '') in ('Draft', 'Waiting Approval')
  and coalesce(approved, 0) = 0
);

-- ── 3. บันทึกใน schema_migrations ให้ตามรอยได้ ───────────────────────────────
insert into public.schema_migrations (filename, note)
select 'security_p18_expense_draft_flow.sql',
       'expense draft flow: approver opens drafts for planner, requester edits/submits own draft'
where not exists (
  select 1 from public.schema_migrations where filename = 'security_p18_expense_draft_flow.sql'
);

commit;
