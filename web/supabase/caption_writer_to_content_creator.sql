-- ย้ายคนเขียนแคปชั่นจาก Creative Leader ไปเป็น Content Creator (5 ต.ค. 69)
--
-- โค้ดแก้ต้นทางแล้ว (db/brief.ts → resolveCaptionWriter เลือก Content Creator ก่อน)
-- ไฟล์นี้แก้ของเดิมที่ระบบ stamp เป็น Creative Leader ไว้ ทำให้ task "แก้ caption"
-- ไปหา Pichayaporn แทน Ninew
--
-- ขอบเขต:
--   1. โพสต์ที่แคปชั่นยังไม่อนุมัติ และคนเขียนเป็น Creative Leader
--      (ข้ามโพสต์ที่มีคนกดมอบหมายให้ Creative Leader เองใน changeLog)
--   2. task "แก้ caption" ที่ยังเปิดอยู่ของ Creative Leader
--   Approved = จบแล้ว ไม่แตะ
--
-- ชื่ออ่านจาก members ไม่ฮาร์ดโค้ด · วางใน Supabase → SQL Editor → Run · รันซ้ำได้

begin;

with lead as (
  select btrim(name) as name from members
   where btrim(coalesce(role,'')) = 'Creative Leader' and lower(coalesce(status,'')) = 'active'
   order by name limit 1
), writer as (
  select btrim(name) as name from members
   where btrim(coalesce(role,'')) = 'Content Creator' and lower(coalesce(status,'')) = 'active'
   order by name limit 1
)
update content_posts p
   set data = p.data || jsonb_build_object('owner', writer.name)
  from lead, writer
 where p.deleted_at is null
   and coalesce(p.data->>'captionStatus','') <> 'Approved'
   and btrim(coalesce(p.data->>'owner','')) = lead.name
   and coalesce(p.data->>'changeLog','') not like '%มอบหมายให้ ' || lead.name || '%';

with lead as (
  select btrim(name) as name from members
   where btrim(coalesce(role,'')) = 'Creative Leader' and lower(coalesce(status,'')) = 'active'
   order by name limit 1
), writer as (
  select btrim(name) as name from members
   where btrim(coalesce(role,'')) = 'Content Creator' and lower(coalesce(status,'')) = 'active'
   order by name limit 1
)
update tasks t
   set assignee = writer.name
  from lead, writer
 where t.deleted_at is null
   and t.assignee = lead.name
   and t.status = 'Todo'
   and coalesce(t.data->>'title', t.title, '') ilike 'แก้ caption%';

commit;
