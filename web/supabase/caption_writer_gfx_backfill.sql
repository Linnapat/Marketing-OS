-- ย้ายคนเขียนแคปชั่นของโพสต์ที่สร้างจากหน้า Graphic / Content Plan ไปเป็น Content Creator (15 ต.ค. 69)
--
-- caption_writer_to_content_creator.sql (5 ต.ค.) แก้เฉพาะแถวที่เป็น Creative Leader
-- แต่โพสต์ที่สร้างเองจากฟอร์ม (ไม่ผ่านบรีฟ) stamp คนกดสร้างเป็นคนเขียน
-- (Pichayaporn / Pupay / narawich) — โค้ดแก้ที่ createContent แล้ว ไฟล์นี้แก้ของค้าง
--
-- ขอบเขต: แคปชั่นยังไม่ Approved · ยังไม่ Published · คนเขียนไม่ใช่ Content Creator
--         · ไม่มีคนกดมอบหมายเองใน changeLog
-- ดูก่อนด้วยบล็อก SELECT ด้านล่าง แล้วค่อยรัน begin…commit · รันซ้ำได้

-- 1) dry-run
with writer as (
  select btrim(name) as name from members
   where btrim(coalesce(role,'')) = 'Content Creator' and lower(coalesce(status,'')) = 'active'
   order by name limit 1
)
select p.id, p.data->>'title' as title, p.data->>'owner' as owner_now, writer.name as owner_new
  from content_posts p, writer
 where p.deleted_at is null
   and coalesce(p.data->>'captionStatus','') <> 'Approved'
   and coalesce(p.data->>'publishStatus','') <> 'Published'
   and btrim(coalesce(p.data->>'owner','')) <> writer.name
   and coalesce(p.data->>'changeLog','') not like '%มอบหมายให้%';

-- 2) apply
begin;

with writer as (
  select btrim(name) as name from members
   where btrim(coalesce(role,'')) = 'Content Creator' and lower(coalesce(status,'')) = 'active'
   order by name limit 1
)
update content_posts p
   set owner = writer.name,
       data  = p.data || jsonb_build_object('owner', writer.name)
  from writer
 where p.deleted_at is null
   and coalesce(p.data->>'captionStatus','') <> 'Approved'
   and coalesce(p.data->>'publishStatus','') <> 'Published'
   and btrim(coalesce(p.data->>'owner','')) <> writer.name
   and coalesce(p.data->>'changeLog','') not like '%มอบหมายให้%';

commit;
