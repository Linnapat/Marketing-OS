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
-- Two prefixes, one rule. `CPN010_` came from the Ads sheet; Omakase Don's
-- `OMD-20260901-003 — ` is the same idea one team over, and reads even closer to
-- the app's own code (OMD-2026-004) than CPN ever did.
create temp table campaign_rename on commit drop as
select id,
       name as old_name,
       coalesce(
         (regexp_match(name, '^(CPN[0-9]+)[_ ]\s*'))[1],
         (regexp_match(name, '^(OMD-[0-9]{8}-[A-Za-z0-9]+)\s*[—–-]\s*'))[1]
       ) as legacy_code,
       btrim(regexp_replace(regexp_replace(regexp_replace(
         name, '^CPN[0-9]+[_ ]\s*', ''), '^OMD-[0-9]{8}-[A-Za-z0-9]+\s*[—–-]\s*', ''), '\s+', ' ', 'g')) as new_name
  from campaigns
 where name ~ '^CPN[0-9]+[_ ]'
    or name ~ '^OMD-[0-9]{8}-[A-Za-z0-9]+\s*[—–-]\s*'
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

-- 4 ── Rows typed by hand after the 26 Jul campaign_id backfill, so they carry a
-- CPN name and no link at all. CPN01_KCC is the campaign the CMO mapped it to
-- then; without this they keep a name no campaign answers to.
update tasks set campaign_id = 'CAM-2026-5945' where campaign = 'CPN01_KCC' and campaign_id is null;
update requests set campaign_id = 'CAM-2026-5945' where campaign = 'CPN01_KCC' and campaign_id is null;

-- Anything still disagreeing with its campaign — including task 115, whose text
-- was left behind by that backfill — takes the campaign's name.
update tasks t     set campaign = c.name from campaigns c where t.campaign_id = c.id and t.campaign is distinct from c.name;
update requests r  set campaign = c.name from campaigns c where r.campaign_id = c.id and r.campaign is distinct from c.name;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Second pass, same day: the copy the app actually reads, and a new code format
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Steps 3-4 updated the `campaign` COLUMN. For tasks, content_posts,
-- graphic_requests and kols that column is only a queryable mirror — fetchGraphics
-- and friends build their rows from the `data` jsonb blob, so the app went on
-- rendering "CPN010_Seasonal menu" from a copy of the name nested inside it.

begin;

-- 5 ── The blob copy, for the four modules that read it.
update tasks t            set data = t.data || jsonb_build_object('campaign', c.name) from campaigns c where t.campaign_id = c.id and t.data ? 'campaign' and t.data->>'campaign' is distinct from c.name;
update content_posts p    set data = p.data || jsonb_build_object('campaign', c.name) from campaigns c where p.campaign_id = c.id and p.data ? 'campaign' and p.data->>'campaign' is distinct from c.name;
update graphic_requests g set data = g.data || jsonb_build_object('campaign', c.name) from campaigns c where g.campaign_id = c.id and g.data ? 'campaign' and g.data->>'campaign' is distinct from c.name;
update kols k             set data = k.data || jsonb_build_object('campaign', c.name) from campaigns c where k.campaign_id = c.id and k.data ? 'campaign' and k.data->>'campaign' is distinct from c.name;

-- 22 tasks held an old campaign name in the blob and no campaign_id at all, so
-- step 5 could not reach them. Each old name belongs to exactly one campaign.
with old_names(id, old_name) as (values
  ('CAM-2026-9148','CPN05_Fuji Don (USP)'),('CAM-2026-2981','CPN06_CRM Loop'),
  ('CAM-2026-2751','CPN01 Branding Sit and done'),('CAM-2026-4008','CPN02 Branding Delivery'),
  ('CAM-2026-9285','CPN07 CTK Grand Opening Central Pinklao'),
  ('CAM-2026-5702','CPN016_WHAT ARE YOU CELEBRATING TODAY?'),('CAM-2026-5945','CPN018_KCC (KEEP CLIMBING CLUB)'),
  ('CAM-2026-5818','CPN017_Mother''s Day'),('CAM-2026-7028','CPN011_Lunch  Sathorn '),
  ('CAM-2026-4770','CPN010_Seasonal menu'),('CAM-2026-3134','CPN013_Ads Branding (Eat/Drink/celebrate life)'),
  ('CAM-2026-4610','OMD-20260901-MASTER — RESET YOUR DAY with OMD'),
  ('CAM-2026-6747','OMD-20260901-002 — Central Pinklao Local Growth'),
  ('CAM-2026-4856','OMD-20260901-003 — Kani Seasonal'),('CAM-2026-4064','OMD-20260901-005 — Unlimited Side Dish'),
  ('CAM-2026-9374','OMD-20260901-006 — Delivery and Takeaway'),('CAM-2026-3897','OMD-20260901-007 — CRM Repeat Visit'))
update tasks t
   set campaign_id = c.id, campaign = c.name, data = t.data || jsonb_build_object('campaign', c.name)
  from old_names o join campaigns c on c.id = o.id
 where t.campaign_id is null and t.data->>'campaign' = o.old_name;

-- 6 ── New code format, BRAND_YYMM_NNN (OMD_2609_001). YYMM is the month the
-- campaign RUNS, not the month it was created; the running number restarts each
-- month within a brand. Ordering inside a month follows creation, then the old
-- code, so the sequence the team already knows is preserved. The retired
-- year-scoped code is kept as previousCode — it is on printed briefs by now.
create temp table code_remap on commit drop as
with b as (
  select id, data->>'code' old_code, created_at,
    case brand when 'teppen' then 'TPN' when 'omakase' then 'OMD'
               when 'mainichi' then 'MNC' when 'touka' then 'TOU' else upper(left(brand,3)) end bc,
    to_char((data->>'startDate')::date, 'YYMM') ym
  from campaigns
)
select id, old_code,
       bc||'_'||ym||'_'||lpad((row_number() over (partition by bc, ym order by created_at, old_code))::text, 3, '0') as new_code
  from b;

update campaigns c
   set data = c.data || jsonb_build_object('code', m.new_code, 'previousCode', m.old_code)
  from code_remap m where c.id = m.id;

commit;
