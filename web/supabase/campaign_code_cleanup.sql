-- One campaign number, not two — 2026-07-31
--
-- Campaign names carried a hand-written code from the old Ads sheet
-- ("CPN010_Seasonal menu") while the app assigned its own per-brand running
-- code ("TPN-2026-002"), so a campaign showed two unrelated numbers at once and
-- neither was reliably unique. This keeps the app's code as the one number on
-- screen and preserves the hand-written one as `data.legacyCode`, so anything
-- still filed under CPN can be traced.
--
-- Pre-state and the exact old names: campaign_code_cleanup.snapshot.md
-- Undo: campaign_code_cleanup_rollback.sql
--
-- Safe to re-run: step 1 only fills a missing code, and step 2's pattern no
-- longer matches once the prefix is gone.

begin;

-- 1 ── The three campaigns created before the code feature existed. Their
-- numbers continue the TEPPEN sequence in creation order, which is what
-- nextCampaignCode() would have given them at the time.
update campaigns c
   set data = coalesce(c.data, '{}'::jsonb) || jsonb_build_object('code', v.code)
  from (values
          ('CAM-2026-5945', 'TPN-2026-006'),  -- KCC (KEEP CLIMBING CLUB)
          ('CAM-2026-5818', 'TPN-2026-007'),  -- Mother's Day
          ('CAM-2026-5702', 'TPN-2026-008')   -- WHAT ARE YOU CELEBRATING TODAY?
       ) as v(id, code)
 where c.id = v.id
   and c.data->>'code' is null;

-- 2 ── Split the hand-written prefix off the name. The map is a temp table
-- because every child table below needs both the old name (to match rows that
-- never got a campaign_id) and the new one.
create temp table campaign_rename on commit drop as
select id,
       name as old_name,
       (regexp_match(name, '^(CPN[0-9]+)[_ ]\s*'))[1] as legacy_code,
       btrim(regexp_replace(regexp_replace(name, '^CPN[0-9]+[_ ]\s*', ''), '\s+', ' ', 'g')) as new_name
  from campaigns
 where name ~ '^CPN[0-9]+[_ ]'
    or name <> btrim(regexp_replace(name, '\s+', ' ', 'g'));  -- stray whitespace

-- The brief blob carries its own copy of the name; the detail page reads that
-- one, so it has to move with the row or the two disagree.
update campaigns c
   set name = m.new_name,
       data = coalesce(c.data, '{}'::jsonb)
              || jsonb_build_object('name', m.new_name)
              || case when m.legacy_code is null then '{}'::jsonb
                      else jsonb_build_object('legacyCode', m.legacy_code) end
  from campaign_rename m
 where c.id = m.id;

-- 3 ── Every module denormalises the campaign name beside campaign_id, and the
-- Content / Graphic / Task lists render that text rather than joining. Rows that
-- predate the campaign_id backfill are matched on the old name instead.
update tasks t set campaign = m.new_name from campaign_rename m
 where (t.campaign_id = m.id or (t.campaign_id is null and t.campaign = m.old_name))
   and t.campaign is distinct from m.new_name;

update expense_requests x set campaign = m.new_name from campaign_rename m
 where (x.campaign_id = m.id or (x.campaign_id is null and x.campaign = m.old_name))
   and x.campaign is distinct from m.new_name;

update content_posts p set campaign = m.new_name from campaign_rename m
 where (p.campaign_id = m.id or (p.campaign_id is null and p.campaign = m.old_name))
   and p.campaign is distinct from m.new_name;

update graphic_requests g set campaign = m.new_name from campaign_rename m
 where (g.campaign_id = m.id or (g.campaign_id is null and g.campaign = m.old_name))
   and g.campaign is distinct from m.new_name;

update kols k set campaign = m.new_name from campaign_rename m
 where (k.campaign_id = m.id or (k.campaign_id is null and k.campaign = m.old_name))
   and k.campaign is distinct from m.new_name;

update requests r set campaign = m.new_name from campaign_rename m
 where (r.campaign_id = m.id or (r.campaign_id is null and r.campaign = m.old_name))
   and r.campaign is distinct from m.new_name;

update agency_tasks a set campaign = m.new_name from campaign_rename m
 where (a.campaign_id = m.id or (a.campaign_id is null and a.campaign = m.old_name))
   and a.campaign is distinct from m.new_name;

-- assets has a campaign name but no campaign_id, so the old name is all there is
-- to match on.
update assets s set campaign = m.new_name from campaign_rename m
 where s.campaign = m.old_name;

commit;
