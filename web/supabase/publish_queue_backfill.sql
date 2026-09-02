-- โพสต์ที่แคปชั่นและอาร์ตเวิร์กอนุมัติครบแล้ว แต่ช่อง Publish ยังเป็น Draft
--
-- กติกาใหม่ (withPublishQueue) ดันโพสต์เข้าคิวให้เองตอนลายเซ็นที่สองลง — แต่ทำงาน
-- ตอนกดอนุมัติเท่านั้น ของที่อนุมัติไปก่อนหน้านี้จึงยังค้างเป็น Draft กองรวมกับ
-- โพสต์ที่ยังไม่มีใครเริ่ม แยกไม่ออกจนกว่าจะเปิดดูทีละใบ
--
-- เงื่อนไข: captionStatus = 'Approved' และ assetStatus ∈ ('Approved','Final')
--   'Final' คือคำเดิมของ "อนุมัติแล้ว" ที่ยังมีในแถวเก่า — preflight() ก็นับทั้งคู่
--
-- ขยับเฉพาะแถวที่ยังเป็น 'Draft' — ไม่แตะ Published (ลงไปแล้ว) ไม่แตะ Queued
-- (อยู่ในคิวอยู่แล้ว) และไม่ดึงกลับโพสต์ที่ใครตั้งใจย้ายไปสถานะอื่นเอง
--
-- วางใน Supabase → SQL Editor → Run · รันซ้ำได้

begin;

update content_posts
   set data = data || jsonb_build_object('publishStatus', 'Queued')
 where deleted_at is null
   and data->>'captionStatus' = 'Approved'
   and data->>'assetStatus' in ('Approved', 'Final')
   and coalesce(data->>'publishStatus', '') = 'Draft';

commit;
