-- Undo campaign_code_cleanup.sql — restores the names exactly as recorded in
-- campaign_code_cleanup.snapshot.md and drops the two keys that migration added.
-- Campaign ids never changed, so nothing needs re-linking.

begin;

create temp table campaign_restore on commit drop as
select * from (values
  ('CAM-2026-9148', 'CPN05_Fuji Don (USP)'),
  ('CAM-2026-2981', 'CPN06_CRM Loop'),
  ('CAM-2026-7516', 'MS_Delivery '),
  ('CAM-2026-2751', 'CPN01 Branding Sit and done'),
  ('CAM-2026-4008', 'CPN02 Branding Delivery'),
  ('CAM-2026-9285', 'CPN07 CTK Grand Opening Central Pinklao'),
  ('CAM-2026-5702', 'CPN016_WHAT ARE YOU CELEBRATING TODAY?'),
  ('CAM-2026-5945', 'CPN018_KCC (KEEP CLIMBING CLUB)'),
  ('CAM-2026-5818', 'CPN017_Mother''s Day'),
  ('CAM-2026-7028', 'CPN011_Lunch  Sathorn '),
  ('CAM-2026-4770', 'CPN010_Seasonal menu'),
  ('CAM-2026-3134', 'CPN013_Ads Branding (Eat/Drink/celebrate life)'),
  ('CAM-2026-4610', 'OMD-20260901-MASTER — RESET YOUR DAY with OMD'),
  ('CAM-2026-6747', 'OMD-20260901-002 — Central Pinklao Local Growth'),
  ('CAM-2026-4856', 'OMD-20260901-003 — Kani Seasonal'),
  ('CAM-2026-4064', 'OMD-20260901-005 — Unlimited Side Dish'),
  ('CAM-2026-9374', 'OMD-20260901-006 — Delivery and Takeaway'),
  ('CAM-2026-3897', 'OMD-20260901-007 — CRM Repeat Visit')
) as v(id, old_name);

-- Current name is needed to find the child rows written by the migration.
create temp table campaign_restore_map on commit drop as
select r.id, c.name as new_name, r.old_name
  from campaign_restore r join campaigns c on c.id = r.id;

update campaigns c
   set name = m.old_name,
       data = (coalesce(c.data, '{}'::jsonb) - 'legacyCode')
              || jsonb_build_object('name', m.old_name)
  from campaign_restore_map m
 where c.id = m.id;

update tasks t            set campaign = m.old_name from campaign_restore_map m where t.campaign_id = m.id or (t.campaign_id is null and t.campaign = m.new_name);
update expense_requests x set campaign = m.old_name from campaign_restore_map m where x.campaign_id = m.id or (x.campaign_id is null and x.campaign = m.new_name);
update content_posts p    set campaign = m.old_name from campaign_restore_map m where p.campaign_id = m.id or (p.campaign_id is null and p.campaign = m.new_name);
update graphic_requests g set campaign = m.old_name from campaign_restore_map m where g.campaign_id = m.id or (g.campaign_id is null and g.campaign = m.new_name);
update kols k             set campaign = m.old_name from campaign_restore_map m where k.campaign_id = m.id or (k.campaign_id is null and k.campaign = m.new_name);
update requests r         set campaign = m.old_name from campaign_restore_map m where r.campaign_id = m.id or (r.campaign_id is null and r.campaign = m.new_name);
update agency_tasks a     set campaign = m.old_name from campaign_restore_map m where a.campaign_id = m.id or (a.campaign_id is null and a.campaign = m.new_name);
update assets s           set campaign = m.old_name from campaign_restore_map m where s.campaign = m.new_name;

-- The three codes this migration invented (the campaigns predate the feature).
update campaigns set data = data - 'code'
 where id in ('CAM-2026-5945', 'CAM-2026-5818', 'CAM-2026-5702');

-- Step 4's hand-typed rows go back to unlinked. Their `campaign` text is
-- restored to what was typed, since no campaign of that name exists to derive it
-- from once the link is gone.
update tasks    set campaign_id = null, campaign = 'CPN01_KCC' where id in (234, 249);
update requests set campaign_id = null, campaign = 'CPN01_KCC' where id = 'REQ-2026-YETL2';
update tasks    set campaign = 'Must Eat_Kani festival' where id = 115;

commit;
