-- Rollback security_p18 — กลับไปใช้ INSERT policy ของ p12 ตามเดิม
-- (ฟอร์มส่งคำขอเท่านั้น: Waiting Approval + requester = คนล็อกอิน) และถอนสิทธิ์
-- เจ้าของแก้/ส่ง Draft ของตัวเอง

begin;

drop policy if exists requester_draft_update on public.expense_requests;

drop policy if exists staff_write on public.expense_requests;
create policy staff_write on public.expense_requests for insert
with check (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and brand_visible(brand)
  and requester = jwt_member_name()
  and coalesce(status,'') = 'Waiting Approval'
  and coalesce(approved, 0) = 0
);

delete from public.schema_migrations where filename = 'security_p18_expense_draft_flow.sql';

commit;
