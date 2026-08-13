-- โพสต์ที่ยังไม่มีคนเขียนแคปชั่น ทั้งที่รู้ว่าใครเป็นคนวางแผน
--
-- กติกาที่ fan-out ใช้กับโพสต์ใหม่อยู่แล้ว: คนที่วางแผนคอนเทนต์ชิ้นนั้น
-- (`requester` — Content Planner) เป็นเจ้าของงานเขียนแคปชั่นจนกว่าจะมีคนใน
-- Creative รับช่วง แต่โพสต์ที่สร้างก่อนกติกานี้ยังค้าง owner = 'Unassigned'
-- อยู่ 40 จาก 60 แถวที่ยังไม่ถูกลบ (ของ Pupay 24, ของ Gik 16) — ผลคืองาน
-- เขียนแคปชั่นพวกนี้ไม่เข้า My Tasks ของใคร ไม่ถูกนับใน workload และขึ้น
-- Status Board ว่า "ยังไม่มีเจ้าของ"
--
-- ฝั่งแอปอ่านผ่าน captionOwner() แล้ว (owner ที่เป็นคนจริง ไม่งั้นตกมาที่
-- requester) แถวพวกนี้จึงแสดงถูกอยู่แล้วโดยไม่ต้องรัน SQL นี้ — สคริปต์นี้คือ
-- การทำให้ฐานข้อมูลพูดตรงกับหน้าจอ เพื่อให้ query/รายงานที่อ่าน
-- content_posts.owner ตรง ๆ ได้คำตอบเดียวกัน
--
-- ปลอดภัยกับข้อมูล: แตะเฉพาะแถวที่ owner ว่างหรือเป็น 'Unassigned' (ไม่มี
-- ข้อมูลคนอยู่แล้ว) และต้องมี requester ที่เป็นชื่อคนจริง ไม่เขียนทับใครทั้งสิ้น
-- รันซ้ำได้ · Rollback: content_owner_backfill_rollback.sql (คืนเฉพาะแถวที่
-- สคริปต์นี้แตะ โดยดูจาก data->>'ownerBackfilledAt')

begin;

with target as (
  select id
  from public.content_posts
  where deleted_at is null
    and coalesce(nullif(btrim(data->>'owner'), ''), 'Unassigned') = 'Unassigned'
    and coalesce(btrim(data->>'requester'), '') <> ''
    and lower(btrim(data->>'requester')) <> 'unassigned'
)
update public.content_posts p
set data = p.data
       || jsonb_build_object('owner', btrim(p.data->>'requester'))
       -- ร่องรอยไว้ให้ rollback ตามเก็บได้ตรงแถว ไม่ต้องเดา
       || jsonb_build_object('ownerBackfilledAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    owner = btrim(p.data->>'requester')
from target t
where p.id = t.id;

insert into public.schema_migrations (filename, note)
select 'content_owner_backfill.sql',
       'content posts with no writer now owned by their content planner (requester)'
where not exists (
  select 1 from public.schema_migrations where filename = 'content_owner_backfill.sql'
);

commit;
