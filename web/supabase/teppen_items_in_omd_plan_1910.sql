-- TEPPEN items in the OMD content plan · CAM-2026-1303 (OMD "Brand Awareness")
--
-- OMD and TEPPEN each have a campaign named "Brand Awareness"
-- (CAM-2026-1303 / OMD_2609_007 and CAM-2026-7682 / TPN_2609_006).
-- Graphic Request → appendBriefItem() looks the campaign up by NAME, so every
-- TEPPEN request made from the Graphic Request page (C08–C53, Aug–Oct) wrote
-- its plan row into OMD's Content Plan instead of TEPPEN's.
--
-- On 2026-10-19 11:08 the OMD planner saved the OMD campaign (removed
-- HR11/LNP11 rows); the fan-out saw 46 plan rows with no OMD request and made
-- them all: graphic requests 429–475 (except 461), OMD_2609_007-C41…C?? ,
-- 46 "Planned" posts in the OMD content plan and 46 Todo "Graphic — …" tasks.
-- TEPPEN's own requests/posts (TPN_2609_006) are untouched and stay.
--
-- This script:
--   1. backs up OMD's content plan array (campaigns_content_backup_omd_1910);
--   2. trashes (soft delete, restorable from /trash) the 46 requests, their
--      46 posts and 46 tasks — only while still untouched (New Request /
--      Planned / Todo);
--   3. removes the 46 TEPPEN rows from OMD's Content Plan so the next save
--      does not fan them out again.
-- Not touched: 461 "Christmas Gift for Members — Artwork" (OMD's own item; a
-- fan-out copy of request 353 — separate question).
--
-- Undo: teppen_items_in_omd_plan_1910_rollback.sql

begin;

create temp table stray on commit drop as
select g.id rowid, g.data->>'id' gid, g.data->>'sourceContentItemId' src
  from graphic_requests g
 where g.id between 429 and 475 and g.id <> 461
   and g.data->>'campaignId' = 'CAM-2026-1303'
   and g.data->>'stage' = 'New Request'
   and g.deleted_at is null;

create table if not exists campaigns_content_backup_omd_1910 as
select id, data->'content' content, now() backed_up_at from campaigns where id = 'CAM-2026-1303';
alter table campaigns_content_backup_omd_1910 enable row level security;

update graphic_requests g
   set deleted_at = now(), deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD'
  from stray s
 where g.id = s.rowid;

update content_posts p
   set deleted_at = now(), deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD'
  from stray s
 where p.campaign_id = 'CAM-2026-1303'
   and p.data->>'sourceContentItemId' = s.src
   and coalesce(p.data->>'status', '') = 'Planned'
   and p.deleted_at is null;

update tasks t
   set deleted_at = now(), deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD'
  from stray s
 where t.data->>'relatedGraphicId' = s.gid
   and t.status = 'Todo'
   and t.deleted_at is null;

update campaigns c
   set data = jsonb_set(c.data, '{content}', (
     select coalesce(jsonb_agg(ci order by ord), '[]'::jsonb)
       from jsonb_array_elements(c.data->'content') with ordinality a(ci, ord)
      where ci->>'id' not in (select src from stray)))
 where c.id = 'CAM-2026-1303';

commit;

-- Expect: 46 / 46 / 46 trashed, plan 110 → 64 rows.
select 'graphic' k, count(*) from graphic_requests where deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD'
union all select 'post', count(*) from content_posts where deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD'
union all select 'task', count(*) from tasks where deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD'
union all select 'plan rows', jsonb_array_length(data->'content') from campaigns where id = 'CAM-2026-1303';
