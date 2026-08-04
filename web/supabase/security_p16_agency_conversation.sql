-- p16 · ให้ Agency คุยในใบงานของตัวเองได้
--
-- ปัญหา: กล่อง "คุยกันในงานนี้" ขึ้นให้ทุกคนที่เปิดใบงานได้ รวมถึง Agency ที่เข้า
-- ผ่าน Agency Portal (หน้านั้นเปิด GraphicDrawer ตัวเต็ม ไม่ได้ซ่อนแท็บอะไร) —
-- แต่ RLS ของ graphic_feedback เปิดไว้แค่ ('admin','staff') เท่านั้น
-- (supabase/feedback_p1.sql) ส่วน p10 ที่เปิด Agency Portal ให้ไป แตะแค่
-- graphic_requests / members / agency_tasks ไม่ได้แตะตารางนี้
--
-- ผลคือ Agency จะเห็นกล่องพิมพ์ กดส่ง แล้วเด้ง error — และอ่านบทสนทนาก็ไม่ได้
-- ด้วย เพราะ SELECT โดนบล็อกเหมือนกัน คือทางตันแบบ "ปุ่มมีแต่กดไม่ได้" ซึ่งเป็น
-- สิ่งเดียวกับที่ระบบนี้พยายามกำจัดมาตลอด
--
-- ขอบเขตที่ให้: เฉพาะใบงานที่ตัวเองเป็นคนทำ (owns_designer_slot ตัวเดียวกับที่
-- p10 ใช้กับ graphic_requests) — ไม่ใช่ทั้งตาราง
--
-- จงใจไม่ให้ UPDATE / DELETE: กด Resolve หรือแก้ข้อความของคนอื่นไม่ได้
-- ประวัติการตีงานเป็นหลักฐาน ไม่ใช่ของที่ผู้รับงานลบเองได้
--
-- policy เดิม staff_rw (FOR ALL) ไม่ถูกแตะ — policy หลายอันเป็น OR กัน
-- การเพิ่มอันนี้จึงเป็น additive ล้วน ๆ ทีมภายในไม่มีอะไรเปลี่ยน
--
-- ตรวจก่อนรัน: ต้องมี public.owns_designer_slot อยู่แล้ว (มาจาก
-- security_p10_agency_portal.sql) ถ้ายังไม่ได้รัน p10 ให้รันก่อน

do $$
begin
  if to_regclass('public.graphic_feedback') is null then
    raise notice 'ยังไม่มีตาราง graphic_feedback — รัน supabase/feedback_p1.sql ก่อน';
    return;
  end if;
  if to_regproc('public.owns_designer_slot(text)') is null then
    raise exception 'ยังไม่มี owns_designer_slot() — ต้องรัน security_p10_agency_portal.sql ก่อน';
  end if;
end $$;

-- อ่านบทสนทนาของใบงานตัวเอง
drop policy if exists agency_own_feedback_read on graphic_feedback;
create policy agency_own_feedback_read on graphic_feedback
for select
using (
  auth.role() = 'authenticated'
  and app_role() = 'agency'
  and exists (
    select 1 from graphic_requests g
    where g.id = graphic_feedback.gid
      and owns_designer_slot(g.designer)
  )
);

-- ตอบกลับได้ แต่ต้องเป็นใบงานตัวเอง และต้องลงชื่อตัวเอง
-- (owner ปลอมเป็นคนอื่นไม่ได้ — บทสนทนาต้องเชื่อชื่อคนพูดได้)
drop policy if exists agency_own_feedback_write on graphic_feedback;
create policy agency_own_feedback_write on graphic_feedback
for insert
with check (
  auth.role() = 'authenticated'
  and app_role() = 'agency'
  and exists (
    select 1 from graphic_requests g
    where g.id = graphic_feedback.gid
      and owns_designer_slot(g.designer)
  )
  and (
    lower(btrim(coalesce(owner, ''))) = lower(btrim(coalesce(jwt_member_name(), '\x00')))
    or lower(btrim(coalesce(owner, ''))) = jwt_email()
  )
);

comment on policy agency_own_feedback_read on graphic_feedback is
  'Agency อ่านบทสนทนาได้เฉพาะใบงานที่ตัวเองเป็นคนทำ';
comment on policy agency_own_feedback_write on graphic_feedback is
  'Agency ตอบได้เฉพาะใบงานตัวเอง และต้องลงชื่อตัวเองเท่านั้น';
