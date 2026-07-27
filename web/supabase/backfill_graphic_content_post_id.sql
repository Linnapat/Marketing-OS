-- Backfill graphic_requests.data->>'contentPostId' — the Phase 1 link between a
-- Graphic Request and the Content Plan post it produces artwork for.
--
-- ทำไมต้อง backfill: ก่อนหน้านี้การจับคู่อาศัย sourceContentItemId ซึ่ง **ไม่ unique**
-- (เป็นเลขแถวในบรีฟ "ci-1", "ci-2" … เริ่มใหม่ทุกแคมเปญ — ข้อมูลจริงมี "ci-1"
-- อยู่ใน 13 แคมเปญพร้อมกัน และมี id ชนกันข้ามแคมเปญ 488 คู่) พอแยกฟอร์มแล้ว
-- graphic request จะเกิดได้โดยไม่มีโพสต์ชี้กลับ ซึ่งจะทำให้ตกไปใช้ตัวจับคู่ที่กำกวม
--
-- ที่มาของค่า: โพสต์ที่ชี้กลับมาหา request นี้อยู่แล้ว (data->>'graphicRequestId')
-- ตรวจก่อนรันแล้ว: 46/46 request มีโพสต์ชี้กลับครบ, ไม่มี request ไหนถูกโพสต์
-- มากกว่า 1 อันอ้างสิทธิ์ (ไม่งั้น update จะเลือกแบบไม่แน่นอน) และยังไม่มีแถวไหน
-- มี contentPostId มาก่อน
--
-- idempotent: รันซ้ำได้ แถวที่มีค่าแล้วจะถูกข้าม
-- rollback: backfill_graphic_content_post_id_rollback.sql

set search_path = public;

update graphic_requests g
set data = jsonb_set(g.data, '{contentPostId}', to_jsonb(c.data ->> 'id'))
from content_posts c
where c.data ->> 'graphicRequestId' = g.data ->> 'id'
  and g.data ->> 'contentPostId' is null
  and c.data ->> 'id' is not null;
