-- คืนค่า owner ของโพสต์ที่ content_owner_backfill.sql แตะไว้ กลับเป็น 'Unassigned'
-- ตามรอยจาก data->>'ownerBackfilledAt' จึงไม่แตะโพสต์ที่คนมอบหมายกันเองทีหลัง
-- (ถ้ามีคนเปลี่ยน owner หลัง backfill แถวนั้นจะยังมี ownerBackfilledAt ติดอยู่
--  แต่ owner ไม่ตรงกับ requester แล้ว — เงื่อนไขด้านล่างจึงข้ามให้)

begin;

update public.content_posts p
set data = (p.data - 'ownerBackfilledAt') || jsonb_build_object('owner', 'Unassigned'),
    owner = 'Unassigned'
where p.data ? 'ownerBackfilledAt'
  and btrim(coalesce(p.data->>'owner', '')) = btrim(coalesce(p.data->>'requester', ''));

delete from public.schema_migrations where filename = 'content_owner_backfill.sql';

commit;
