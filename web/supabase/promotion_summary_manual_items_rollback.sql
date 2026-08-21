-- Rollback ของ promotion_summary_manual_items.sql
--
-- ระวัง: ถอดคอลัมน์ hidden ทิ้ง = แคมเปญที่ทีมซ่อนไว้จะกลับมาโผล่บนใบพิมพ์ทันที
-- ส่วนโปรฯ ที่เพิ่มเอง (source='manual') ไม่ถูกลบ — ถ้าจะเอาออกด้วยให้รัน
--   delete from promotion_summary_items where source = 'manual';

alter table promotion_summary_items drop column if exists hidden;
