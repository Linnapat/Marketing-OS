-- rollback ของ backfill_graphic_content_post_id.sql
-- ถอด contentPostId ออกจาก data blob ของ graphic_requests ทุกแถว
-- (ตัวจับคู่จะกลับไปใช้ graphicRequestId / campaign+ci ตามลำดับเดิม)

set search_path = public;

update graphic_requests
set data = data - 'contentPostId'
where data ? 'contentPostId';
