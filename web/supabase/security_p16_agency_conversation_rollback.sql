-- ย้อน p16 · ตัด Agency ออกจากบทสนทนาในใบงาน
--
-- กลับไปสภาพเดิม: graphic_feedback เปิดให้เฉพาะ ('admin','staff') ตาม
-- staff_rw ใน feedback_p1.sql — ซึ่งแปลว่า Agency จะเห็นกล่องพิมพ์แต่กดส่งไม่ได้
-- อีกครั้ง ถ้าจะย้อนจริง ควรซ่อนกล่องฝั่ง UI ด้วย ไม่งั้นเหลือทางตันไว้

drop policy if exists agency_own_feedback_read on graphic_feedback;
drop policy if exists agency_own_feedback_write on graphic_feedback;
