-- TEPPEN reels stuck in "New Request" · TPN_2609_006 C46, C51–C69
--
-- Pichayaporn is both the requester and the Creative Leader on these. She
-- assigned the editor (Four / GID), the storyboard was approved and Jeeno was
-- named to shoot — but the requester may not press รับงาน on her own brief, and
-- assigning a producer only wrote the name, so nobody ever accepted and the
-- jobs stayed "New Request". Code now treats assigning as the hand-off
-- (assignProducer); this applies the same thing to the 20 already assigned.
--
-- Only rows still New Request, unaccepted, with a real producer named.
-- Undo: teppen_vdo_accept_assigned_0811_rollback.sql

begin;

update graphic_requests g
   set stage = 'In Progress',
       data = g.data || jsonb_build_object(
         'stage', 'In Progress',
         'acceptedBy', g.data->>'designer',
         'acceptedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'acceptFixedBy', 'teppen_vdo_accept_assigned_0811',
         'nextAction', (g.data->>'designer') || ' กำลังผลิตงาน',
         'history', coalesce(g.data->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'type', 'assigned', 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'by', 'Pichayaporn', 'note', 'มอบหมายให้ ' || (g.data->>'designer') || ' (รับงานแทน)')))
 where g.deleted_at is null
   and g.data->>'campaignId' = 'CAM-2026-7682'
   and g.data->>'stage' = 'New Request'
   and g.data->>'acceptedAt' is null
   and coalesce(g.data->>'designer', 'Unassigned') not in ('', 'Unassigned');

commit;

-- Expect 20.
select count(*) from graphic_requests where data->>'acceptFixedBy' = 'teppen_vdo_accept_assigned_0811';
