-- แนบ asset ที่อนุมัติแล้วกลับเข้าโพสต์ใน Content Plan
--
-- ปกติแอปทำให้เองตอนกดอนุมัติชิ้นสุดท้าย (syncApprovedAssetsToContent →
-- attachApprovedAssets) แต่ใบที่ถูกปลดด้วย SQL — 28 ชิ้นจาก unblock_revision
-- และ 20 ชิ้นจาก vdo_single_lens — ไม่ได้ผ่านปุ่มนั้น asset จึงไม่เคยไปถึงโพสต์
-- โพสต์เลยค้างเป็น "Waiting Design" ทั้งที่งานอนุมัติครบแล้ว และตกขบวนคิว Queued
--
-- ทำสิ่งเดียวกับ attachApprovedAssets + withPublishQueue เป๊ะ ๆ:
--   assets       = ชิ้นที่อนุมัติแล้วและมีลิงก์ (platform · size · link)
--   assetStatus  = 'Approved'
--   status       'Waiting Design' → 'Draft'
--   publishStatus → 'Queued' เมื่อแคปชั่นอนุมัติแล้วด้วย (ครบสองด้าน)
--                   ไม่แตะ Published และไม่แตะที่อยู่ในคิวแล้ว
--
-- จับคู่งานกับโพสต์ด้วยลิงก์ที่ระบุไว้ตรง ๆ เท่านั้น — contentPostId หรือ
-- graphicRequestId ที่โพสต์ชี้กลับมา (ขั้น 1 และ 2 ของ findLinkedPost) ·
-- ไม่ใช้การเดาจากชื่อ/ci-N เพราะการเดาผิดหมายถึงเอาไฟล์ไปแปะผิดโพสต์
--
-- วางใน Supabase → SQL Editor → Run · รันซ้ำได้

begin;

with approved as (
  -- งานที่ทุกชิ้นอนุมัติครบ พร้อมรายการไฟล์
  select g.data->>'id' as gid, g.data->>'contentPostId' as content_post_id,
         jsonb_agg(jsonb_build_object('platform', d->>'platform', 'size', d->>'size', 'link', d->>'assetLink')
                   order by ord) as assets
  from graphic_requests g,
       lateral jsonb_array_elements(g.data->'deliverables') with ordinality as t(d, ord)
  where g.deleted_at is null
    and jsonb_typeof(g.data->'deliverables') = 'array'
    and not exists (select 1 from jsonb_array_elements(g.data->'deliverables') x
                     where x->>'status' <> 'Approved')
    and d->>'status' = 'Approved'
    and coalesce(btrim(d->>'assetLink'), '') <> ''
  group by g.data->>'id', g.data->>'contentPostId'
),
paired as (
  -- หนึ่งโพสต์ต่อหนึ่งงาน — ถ้าชนกันหลายงาน ข้ามไป ให้คนตัดสินเอง
  select p.id as post_row, min(a.gid) as gid, min(a.assets::text)::jsonb as assets, count(*) as hits
  from content_posts p
  join approved a
    on p.data->>'id' = a.content_post_id
    or p.data->>'graphicRequestId' = a.gid
  where p.deleted_at is null
  group by p.id
  having count(*) = 1
)
update content_posts p
   set data = p.data
     || jsonb_build_object('assets', s.assets, 'assetStatus', 'Approved')
     || case when p.data->>'status' = 'Waiting Design' then jsonb_build_object('status', 'Draft') else '{}'::jsonb end
     || case when p.data->>'captionStatus' = 'Approved'
              and coalesce(p.data->>'publishStatus','') not in ('Published','Queued')
             then jsonb_build_object('publishStatus', 'Queued') else '{}'::jsonb end
  from paired s
 where p.id = s.post_row
   and coalesce(p.data->>'assetStatus','') <> 'Approved';

commit;
