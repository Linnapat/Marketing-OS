-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Content + KOL relational integrity
-- Run once in Supabase → SQL Editor. SAFE TO RE-RUN (idempotent): it only
-- de-duplicates rows that share the same source id, then adds partial unique
-- indexes so the app can't create duplicates again. It NEVER deletes rows that
-- lack a source id, and never touches rows outside the duplicate groups.
--
-- Background: content_posts / graphic_requests / kols keep their full object in
-- a `data jsonb` column. The app now stamps real relational keys inside it:
--   content_posts.data->>'campaignId'  +  data->>'sourceContentItemId'
--   graphic_requests.data->>'campaignId' + data->>'sourceContentItemId'
--   kols.data->>'campaignId'           +  data->>'sourceKolRequirementId'
-- The (campaign, source) pair is the idempotency key for a campaign's fan-out.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Make sure the relational columns exist (schema_v2 already adds `data`) ─
alter table content_posts    add column if not exists campaign_id text;
alter table graphic_requests add column if not exists campaign_id text;
alter table kols             add column if not exists campaign_id text;

-- Backfill campaign_id from the jsonb blob where the column is still null, so
-- the indexes below can also cover older rows that only carry it in `data`.
update content_posts    set campaign_id = data->>'campaignId' where campaign_id is null and data ? 'campaignId';
update graphic_requests set campaign_id = data->>'campaignId' where campaign_id is null and data ? 'campaignId';
update kols             set campaign_id = data->>'campaignId' where campaign_id is null and data ? 'campaignId';

-- ── 1. De-duplicate CONTENT posts by (campaignId, sourceContentItemId) ───────
-- Keep the most complete row: Approved first, then one with a caption, then the
-- newest id. Only rows that actually carry a source id are considered.
with ranked as (
  select id,
    row_number() over (
      partition by coalesce(campaign_id, data->>'campaignId'), data->>'sourceContentItemId'
      order by (case when data->>'approvalStatus' = 'Approved' then 0 else 1 end),
               (case when coalesce(caption, '') <> '' then 0 else 1 end),
               id desc
    ) as rn
  from content_posts
  where data ? 'sourceContentItemId' and data->>'sourceContentItemId' <> ''
)
delete from content_posts where id in (select id from ranked where rn > 1);

-- ── 2. De-duplicate GRAPHIC requests by (campaignId, sourceContentItemId) ────
with ranked as (
  select id,
    row_number() over (
      partition by coalesce(campaign_id, data->>'campaignId'), data->>'sourceContentItemId'
      order by (case when stage in ('Approved', 'Delivered') then 0 else 1 end), id desc
    ) as rn
  from graphic_requests
  where data ? 'sourceContentItemId' and data->>'sourceContentItemId' <> ''
)
delete from graphic_requests where id in (select id from ranked where rn > 1);

-- ── 3. De-duplicate KOL rows by (campaignId, sourceKolRequirementId) ─────────
-- Keep the row furthest along the lifecycle, then the newest id.
with ranked as (
  select id,
    row_number() over (
      partition by coalesce(campaign_id, data->>'campaignId'), data->>'sourceKolRequirementId'
      order by (case data->>'status'
                  when 'Completed' then 0 when 'Posted' then 1 when 'Approved' then 2
                  when 'In Review' then 3 when 'Producing' then 4 else 5 end), id desc
    ) as rn
  from kols
  where data ? 'sourceKolRequirementId' and data->>'sourceKolRequirementId' <> ''
)
delete from kols where id in (select id from ranked where rn > 1);

-- ── 4. Partial unique indexes — block future duplicates (only source-tagged) ─
create unique index if not exists content_posts_source_uniq
  on content_posts (campaign_id, (data->>'sourceContentItemId'))
  where data->>'sourceContentItemId' is not null and data->>'sourceContentItemId' <> '';

create unique index if not exists graphic_requests_source_uniq
  on graphic_requests (campaign_id, (data->>'sourceContentItemId'))
  where data->>'sourceContentItemId' is not null and data->>'sourceContentItemId' <> '';

create unique index if not exists kols_source_uniq
  on kols (campaign_id, (data->>'sourceKolRequirementId'))
  where data->>'sourceKolRequirementId' is not null and data->>'sourceKolRequirementId' <> '';

-- Helpful lookup indexes for the idempotency reads (fetchXSourceIds).
create index if not exists content_posts_campaign_idx    on content_posts (campaign_id);
create index if not exists graphic_requests_campaign_idx on graphic_requests (campaign_id);
create index if not exists kols_campaign_idx             on kols (campaign_id);

commit;

-- Verify (optional): should return 0 rows for each.
-- select campaign_id, data->>'sourceContentItemId' k, count(*) from content_posts
--   where data ? 'sourceContentItemId' group by 1,2 having count(*) > 1;
-- select campaign_id, data->>'sourceKolRequirementId' k, count(*) from kols
--   where data ? 'sourceKolRequirementId' group by 1,2 having count(*) > 1;
