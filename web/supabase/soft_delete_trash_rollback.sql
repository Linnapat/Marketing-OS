-- Rollback ของ soft_delete_trash.sql
--
-- ระวัง: การถอดคอลัมน์ deleted_at ทิ้ง จะทำให้แถวที่ "อยู่ในถังขยะ" กลับมา
-- โผล่ในหน้าปกติทันที (เพราะไม่มีอะไรให้กรองแล้ว) ถ้าตั้งใจจะถอยจริง ให้ล้าง
-- ของในถังก่อน แล้วค่อยถอดคอลัมน์:
--   select purge_expired_trash(0);

drop function if exists purge_expired_trash(int);

drop index if exists content_posts_live_idx;
drop index if exists campaigns_live_idx;
drop index if exists graphic_requests_live_idx;
drop index if exists tasks_live_idx;
drop index if exists content_posts_trash_idx;
drop index if exists campaigns_trash_idx;
drop index if exists graphic_requests_trash_idx;
drop index if exists tasks_trash_idx;

alter table content_posts    drop column if exists deleted_at, drop column if exists deleted_by;
alter table campaigns        drop column if exists deleted_at, drop column if exists deleted_by;
alter table graphic_requests drop column if exists deleted_at, drop column if exists deleted_by;
alter table tasks            drop column if exists deleted_at, drop column if exists deleted_by;
