-- Promotion Summary Print: เพิ่ม/ลบโปรโมชั่นเองได้ — 2026-08-21
--
-- ใบพิมพ์หน้าร้านเคยมาจาก Campaign อย่างเดียว: แคมเปญไหนมี "Promotion หน้าร้าน"
-- ในบรีฟก็ขึ้นใบพิมพ์ทั้งหมด ทีมเลยทำสองอย่างไม่ได้เลย —
--   1) เพิ่มโปรฯ ที่ไม่ได้เป็นแคมเปญ (Must Eat / Drinks / โปรบัตรเครดิต / Big Cleaning)
--   2) เอาแคมเปญที่ไม่อยากให้ขึ้นหน้าร้านออกจากใบพิมพ์
--
-- ตาราง promotion_summary_items มีอยู่แล้ว (ตอนนี้ใช้เก็บแค่ POS name) และรองรับ
-- source='manual' อยู่แล้ว migration นี้จึงเพิ่มแค่ธง hidden ที่ใช้ "ซ่อน" แถวที่
-- มาจากแคมเปญ — ซ่อน ไม่ใช่ลบ เพราะแคมเปญเป็นของโมดูลอื่น ใบพิมพ์ไม่มีสิทธิ์ลบทิ้ง
-- และการซ่อนต้องเอากลับได้
--
-- รันซ้ำได้

alter table promotion_summary_items
  add column if not exists hidden boolean not null default false;

select record_migration(
  'promotion_summary_manual_items.sql',
  'ใบพิมพ์โปรโมชั่น: เพิ่มโปรฯ เองได้ + ซ่อนแคมเปญออกจากใบพิมพ์ (คอลัมน์ hidden)'
);
