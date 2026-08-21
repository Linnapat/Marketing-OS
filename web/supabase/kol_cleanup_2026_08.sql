-- KOL cleanup + KOL codes — decisions taken by Gik on 19 Aug 2026.
--
-- Run the SELECTs first. Each block is idempotent: running it twice changes
-- nothing the second time.
--
--   A. Merge the older category spellings into the official list
--   B. Merge duplicate profiles (same creator saved twice under two spellings)
--   C. Give every profile a KOL-0001 code
--
-- ─────────────────────────────────────────────────────────────────────────
-- A. CATEGORY MERGE
--    "Coach" and "Coaching" are one idea; so are "Food"/"Foodie" and
--    "Food Review", and "Japanese Community" and "Inter Kol". Athlete and
--    Nightlife stay as they are — they joined the official list instead.
-- ─────────────────────────────────────────────────────────────────────────

-- DRY RUN — what will change, and how many rows
select kol_type as from_value,
       case kol_type
         when 'Coach' then 'Coaching'
         when 'Japanese Community' then 'Inter Kol'
         when 'Food' then 'Food Review'
         when 'Foodie' then 'Food Review'
       end as to_value,
       count(*) as profiles
from kol_profiles
where kol_type in ('Coach', 'Japanese Community', 'Food', 'Foodie')
group by 1, 2 order by 3 desc;

-- APPLY
update kol_profiles set kol_type = 'Coaching',    updated_at = now() where kol_type = 'Coach';
update kol_profiles set kol_type = 'Inter Kol',   updated_at = now() where kol_type = 'Japanese Community';
update kol_profiles set kol_type = 'Food Review', updated_at = now() where kol_type in ('Food', 'Foodie');

-- VERIFY — should return no rows
select kol_type, count(*) from kol_profiles
where kol_type is not null
  and kol_type not in ('Food Review','Lifestyle','Family','Celebrity','KOC / Staff',
                       'Coaching','Inter Kol','Athlete','Nightlife')
group by 1;


-- ─────────────────────────────────────────────────────────────────────────
-- B. MERGE DUPLICATE PROFILES
--    Nine creators are in the library twice (three times, for เดียราริ),
--    saved under a Thai and an English spelling of the same name. The keeper
--    in each pair is the row with the most booking history, then the most
--    channels — Gik's rule: เก็บแถวที่มีประวัติใช้งานมากสุด.
--
--    Everything that points at the loser is repointed at the keeper first;
--    the loser row is deleted last, so nothing is ever orphaned.
-- ─────────────────────────────────────────────────────────────────────────

-- No ON COMMIT DROP: the SQL editor runs each statement in its own
-- transaction, and the table has to survive between them. Dropped explicitly
-- at the end of this block.
drop table if exists kol_merge;
create temp table kol_merge(keep uuid, drop_id uuid);
insert into kol_merge(keep, drop_id) values
  -- ChewChewPhuket / ภูเก็ตแอ๊ะนิ
  ('3c665e77-4298-45ad-80a8-bf6f53860638', '8d57a05b-1f36-4635-9856-eb8a8ea78b79'),
  -- เดียราริ / dear.rari / dearari7 เดียราริ  (three rows, one creator)
  ('3a13722d-9128-45e8-a70e-0f1dc2983d36', '919d0a16-abaf-4632-8c3f-e75e213beb48'),
  ('3a13722d-9128-45e8-a70e-0f1dc2983d36', 'e5549015-ed23-4dbc-b368-1e27aa48c60f'),
  -- pair: Fromfattofitdiaryy / fromfattofitdiaryy
  ('24c19bf8-7792-4599-b2e5-ae36b7b04b8d', '01f61997-73c3-49aa-9f67-1a8294194ee9'),
  -- henmuntookdee / Henmuntookdee   (differs by one capital letter)
  ('e1f8ef77-063d-4d7b-92d2-98f7fd6d0c6b', '9e0a7ac4-e739-4140-aa88-09189cef2e79'),
  -- itstaddytd / แทดดี้ itstaddytd
  ('6d76c3ce-c144-47a5-ac6b-8174187ecc3b', 'fb4a47d3-ac4f-46dc-bd74-db53d0bb7e37'),
  -- ไหนรีวิว / nhaireview
  ('4c71de7e-4171-4fba-9f5e-775ea9e2cd1f', '1159cd39-514c-4a31-b6d6-9b279d7d1f7f'),
  -- orn the table อรพากิน / orn the table
  ('9a47bca4-e731-4ac6-93dc-723566e6b1bb', 'e3dbecc8-5d1d-4d25-8a30-141ba514499b'),
  -- shisiryn / chubbyshi
  ('a86ff66e-67b7-46a1-9d40-1ee2939764e8', 'cf29a7ac-27f0-4fcd-aeb3-d6ed7dc4ba3c'),
  -- กฤษครับอยู่ภูเก็ต / SJ RICH KID
  ('98d3bcc6-6041-405c-9799-0a175bacd9ec', 'c032556e-ffd0-4eb2-9fd7-a6e4b5cfd511');

-- DRY RUN — who merges into whom, and what moves
select kp.display_name as keep_name, dp.display_name as drop_name,
       (select count(*) from kol_collaboration_history h where h.kol_id = m.drop_id) as collabs_moving,
       (select count(*) from kol_channels c        where c.kol_id = m.drop_id) as channels_moving,
       (select count(*) from kol_rate_cards rc     where rc.kol_id = m.drop_id) as rates_moving,
       (select count(*) from kol_notes n           where n.kol_id = m.drop_id) as notes_moving,
       (select count(*) from kols k                where k.data->>'masterKolId' = m.drop_id::text) as bookings_moving
from kol_merge m
join kol_profiles kp on kp.kol_id = m.keep
join kol_profiles dp on dp.kol_id = m.drop_id;

-- APPLY
update kol_collaboration_history h set kol_id = m.keep from kol_merge m where h.kol_id = m.drop_id;
update kol_channels             c set kol_id = m.keep from kol_merge m where c.kol_id = m.drop_id;
update kol_rate_cards          rc set kol_id = m.keep from kol_merge m where rc.kol_id = m.drop_id;
update kol_notes                n set kol_id = m.keep from kol_merge m where n.kol_id = m.drop_id;
-- Bookings point at the profile through the jsonb blob, not a foreign key.
update kols k
   set data = jsonb_set(k.data, '{masterKolId}', to_jsonb(m.keep::text))
  from kol_merge m
 where k.data->>'masterKolId' = m.drop_id::text;
-- Rank scores are derived, not history: drop the loser's rather than move it.
delete from kol_rank_scores r using kol_merge m where r.kol_id = m.drop_id;

-- The same channel now appears twice under the keeper (both rows had the same
-- link). Keep the one with a follower count, then the oldest.
delete from kol_channels c using (
  select channel_id from (
    select channel_id,
           row_number() over (
             partition by kol_id, platform,
               lower(regexp_replace(regexp_replace(coalesce(handle_url,''),'^https?://','','i'),'^www\.','','i'))
             order by (followers is null), last_synced_at desc nulls last, channel_id
           ) as rn
    from kol_channels
    where kol_id in (select keep from kol_merge)
  ) ranked where rn > 1
) dup where c.channel_id = dup.channel_id;

delete from kol_profiles p using kol_merge m where p.kol_id = m.drop_id;

-- Recompute the keepers' ranks now that they carry the merged history.
select recompute_kol_rank(keep) from (select distinct keep from kol_merge) k;

-- VERIFY — should return no rows
select p.kol_id, p.display_name from kol_profiles p
join kol_merge m on m.drop_id = p.kol_id;

drop table kol_merge;


-- ─────────────────────────────────────────────────────────────────────────
-- C. KOL CODES
--    The team's own report has identified creators by KOL-0219 for years; the
--    app only had uuids, which nobody can read out to a colleague. Numbered by
--    created_at so the oldest profile is KOL-0001 and the numbering is stable.
--    Run AFTER B, so the merged-away rows do not consume numbers.
-- ─────────────────────────────────────────────────────────────────────────

alter table kol_profiles add column if not exists kol_code text;
create sequence if not exists kol_code_seq start 1;

-- Backfill in creation order. Only rows without a code, so re-running is safe.
with ordered as (
  select kol_id, row_number() over (order by created_at, kol_id) as n
  from kol_profiles where kol_code is null
)
update kol_profiles p
   set kol_code = 'KOL-' || lpad((nextval('kol_code_seq'))::text, 4, '0')
  from ordered o
 where p.kol_id = o.kol_id;

create unique index if not exists kol_profiles_kol_code_uniq on kol_profiles(kol_code);
-- New profiles get their number automatically from here on.
alter table kol_profiles
  alter column kol_code set default 'KOL-' || lpad((nextval('kol_code_seq'))::text, 4, '0');

-- The Library reads the view, so the column has to reach it. The whole
-- definition is restated with kol_code appended LAST — CREATE OR REPLACE VIEW
-- can add columns only at the end, and a view cannot select from itself.
create or replace view kol_scorecard_view as
 with agg as (
   select h.kol_id,
     count(*) as times_used,
     count(*) filter (where h.status = 'Resulted') as times_resulted,
     count(*) filter (where h.status = 'Cancel') as times_cancelled,
     max(coalesce(h.posted_at, h.visited_at)) as last_used_at,
     min(coalesce(h.posted_at, h.visited_at)) as first_used_at,
     array_agg(distinct h.brand) filter (where h.brand is not null) as brands_used,
     array_agg(distinct h.branch) filter (where h.branch is not null) as branches_used,
     sum(h.actual_reach) as total_reach,
     sum(h.actual_engagement) as total_engagement,
     sum(h.total_cost) as total_cost,
     avg(h.brand_feedback_score) as avg_feedback,
     avg(h.on_time_delivery::integer) filter (where h.on_time_delivery is not null) as on_time_rate,
     count(*) filter (where h.on_time_delivery is false) as late_by_kol,
     count(*) filter (where h.posted_at is not null and h.agreed_post_at is not null
                        and h.posted_at > h.agreed_post_at and h.delay_reason is null) as late_unattributed
   from kol_collaboration_history h
   group by h.kol_id
 )
 select p.kol_id, p.display_name, p.kol_type, p.tier, p.status, p.contact_agency, p.is_partner,
   p.data -> 'brand_fit' as brand_fit,
   ch.total_followers, ch.channels, ch.followers_checked_at,
   rc.rate_min_thb, rc.rate_max_thb,
   coalesce(a.times_used, 0::bigint) as times_used,
   a.times_resulted, a.times_cancelled, a.last_used_at, a.first_used_at,
   a.brands_used, a.branches_used, a.total_reach, a.total_engagement, a.total_cost,
   case when coalesce(a.total_reach, 0) > 0 then round(a.total_cost / a.total_reach, 4) end as cost_per_reach,
   case when coalesce(a.total_engagement, 0) > 0 then round(a.total_cost / a.total_engagement, 2) end as cost_per_engagement,
   case when coalesce(ch.total_followers, 0) > 0 and a.total_reach is not null
        then round(a.total_reach / ch.total_followers, 2) end as reach_per_follower,
   case when coalesce(a.total_reach, 0) > 0
        then round(a.total_engagement / a.total_reach * 100, 2) end as engagement_rate,
   a.avg_feedback, a.on_time_rate, a.late_by_kol, a.late_unattributed,
   coalesce(a.times_used, 0::bigint) = 0 as never_used,
   r.rank_score, r.rank_label,
   p.kol_code
 from kol_profiles p
   left join agg a on a.kol_id = p.kol_id
   left join lateral (
     select sum(kol_channels.followers) as total_followers,
            min(kol_channels.last_synced_at) as followers_checked_at,
            jsonb_agg(jsonb_build_object('channel_id', kol_channels.channel_id, 'platform', kol_channels.platform,
                                         'followers', kol_channels.followers, 'url', kol_channels.handle_url,
                                         'checked_at', kol_channels.last_synced_at)
                      order by kol_channels.followers desc nulls last) as channels
     from kol_channels where kol_channels.kol_id = p.kol_id) ch on true
   left join lateral (
     select min(kol_rate_cards.price_thb) as rate_min_thb,
            max(coalesce(kol_rate_cards.price_max_thb, kol_rate_cards.price_thb)) as rate_max_thb
     from kol_rate_cards where kol_rate_cards.kol_id = p.kol_id and kol_rate_cards.is_current) rc on true
   left join kol_rank_scores r on r.kol_id = p.kol_id;

-- VERIFY
select count(*) as profiles, count(kol_code) as numbered,
       min(kol_code) as first_code, max(kol_code) as last_code
from kol_profiles;
