-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — KOL engagement, posts and rate cards
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- WHY THIS EXISTS
--   kol_master.sql gave us WHO the KOL is (kol_profiles + kol_channels) and a
--   Rank cache. What was missing is the working record: every time we actually
--   USE a KOL — which campaign, which branch, what we paid, what came back.
--   That record lives today in four Google Sheet tabs (CONTENT_LOG_Teppen /
--   _OmakaseDon / _Mainichi / _Phuket = 169 rows) plus COST_LOG (57 rows), and
--   this file is what lets us retire them.
--
--   Rather than invent a new `kol_engagements` table, we extend the existing
--   kol_collaboration_history — it is already 1 row per (KOL × campaign) with
--   fee/reach/engagement/on-time/feedback, and recompute_kol_rank() reads it.
--   Adding here keeps Rank working instead of splitting the truth in two.
--
--   New tables:
--     kol_engagement_posts — 1 row per platform post (429 links from the sheet)
--     kol_rate_cards       — 1 row per buyable deliverable, replacing the free
--                            text rate strings ("฿9,000", "12,000-15,000") and
--                            the deal terms buried in the "Why Good?" column
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── kol_profiles.is_partner — the ones we have an actual relationship with ──
-- Distinct from status: a page can be Active (we can book them) without being a
-- partner (we have worked with them repeatedly and the terms are settled).
-- Seeded from history — 2+ bookings is a relationship, 1 is an experiment.
alter table kol_profiles add column if not exists is_partner boolean default false;
create index if not exists kol_profiles_partner_idx on kol_profiles(is_partner) where is_partner;

-- ── Dating the follower counts ─────────────────────────────────────────
-- Every number in the library arrived from a spreadsheet with no timestamp, so
-- nobody can tell a count taken last week from one taken last year. There is no
-- free API that returns these (Instagram/TikTok/Facebook all require the
-- creator's own authorisation), so the counts stay hand-entered — but from now
-- on each one is stamped with when, and by whom. Anything unconfirmed for more
-- than 90 days is shown as undateable rather than as fact.
-- last_synced_at already exists on kol_channels; this records the person.
alter table kol_channels add column if not exists synced_by text;

-- ── Extend kol_collaboration_history into a full engagement record ──────
-- Kept nullable throughout: existing rows (currently none) stay valid, and the
-- sheet itself leaves most of these blank on older entries.
alter table kol_collaboration_history
  -- WHERE / WHEN -------------------------------------------------------
  add column if not exists branch          text,   -- Ekkamai | Sathorn | Central Pin | ...
  add column if not exists campaign_name   text,   -- ชื่อแคมเปญตามที่บันทึกไว้ — ใช้เมื่อ campaign_id ผูกไม่ได้
  add column if not exists month_key       text,   -- 'YYYY-MM' — เดือนที่นับผลงาน
  add column if not exists objective       text,
  -- WHY we picked them --------------------------------------------------
  add column if not exists why_chosen      text,
  add column if not exists deal_type       text,   -- Paid | Barter | Hybrid
  -- LIFECYCLE ------------------------------------------------------------
  add column if not exists status          text,   -- Contacting | Confirmed | Waiting Draft | Waiting Post | Posted (Waiting results) | Resulted | Cancel
  add column if not exists contacted_at    date,
  add column if not exists confirmed_at    date,
  add column if not exists visited_at      date,
  add column if not exists draft_at        date,
  add column if not exists agreed_post_at  date,   -- วันที่ตกลงกับ KOL — ตัวตั้งของคำว่า "ช้า"
  add column if not exists posted_at       date,
  add column if not exists resulted_at     date,
  -- WHOSE FAULT THE DELAY WAS ---------------------------------------------
  add column if not exists delay_reason    text,   -- kol | approval | campaign | venue | other
  add column if not exists delay_note      text,
  add column if not exists delay_logged_by text,
  add column if not exists delay_logged_at timestamptz,
  -- MONEY (was COST_LOG) --------------------------------------------------
  add column if not exists food_cost       numeric,
  add column if not exists paid_fee        numeric,
  add column if not exists boost_cost      numeric,
  add column if not exists other_cost      numeric,
  add column if not exists total_cost      numeric,
  add column if not exists paid_status     text,   -- Yes | No | Partial
  add column if not exists paid_date       date,
  add column if not exists has_receipt     boolean,
  add column if not exists has_tax_invoice boolean,
  -- Specialist creates the expense request manually at reimbursement time;
  -- this is the link back so Finance and KOL do not double-key the number.
  add column if not exists expense_request_id text,
  -- CLOSING THE LOOP — blank on 100% of the sheet rows today ---------------
  add column if not exists performance_tag text,   -- Excellent | Good | Average | Poor
  add column if not exists next_action     text,   -- Reuse next campaign | Renegotiate | Do not reuse | ...
  add column if not exists reviewed_by     text,
  add column if not exists reviewed_at     timestamptz,
  -- HOUSEKEEPING ----------------------------------------------------------
  add column if not exists owner           text,   -- specialist ที่ดูแลงานครั้งนี้
  add column if not exists needs_review    boolean default false,  -- ยกมาจากชีตแบบไม่ครบ ต้องมีคนไปเก็บ
  add column if not exists source_key      text,   -- idempotency key ตอน import เช่น 'sheet:Teppen:14'
  add column if not exists updated_at      timestamptz default now();

-- ── on_time_delivery is derived, not declared ──────────────────────────
-- It used to be a checkbox in the results form that defaulted to "on time",
-- filled in by the same person who managed the deal — and it feeds 20% of
-- recompute_kol_rank(). Nobody was ever going to tick it against themselves.
--
-- The rule that matters: a late post only counts against the creator when the
-- delay was actually theirs. If our own approval ran long, that is our problem
-- and it must not be filed inside their rating, or the score quietly launders
-- our bottleneck into their reputation.
create or replace function kol_apply_on_time() returns trigger
language plpgsql as $$
begin
  if new.posted_at is null or new.agreed_post_at is null then
    new.on_time_delivery := null;                       -- nothing to judge yet
  elsif new.posted_at <= new.agreed_post_at then
    new.on_time_delivery := true;
  elsif new.delay_reason is null then
    new.on_time_delivery := null;                       -- late, but whose fault is unrecorded
  elsif new.delay_reason = 'kol' then
    new.on_time_delivery := false;
  else
    new.on_time_delivery := true;                       -- late, but not the creator's doing
  end if;
  return new;
end $$;

drop trigger if exists kol_on_time_trg on kol_collaboration_history;
create trigger kol_on_time_trg
  before insert or update of posted_at, agreed_post_at, delay_reason
  on kol_collaboration_history
  for each row execute function kol_apply_on_time();

-- Re-importing the same sheet row must update, never duplicate.
create unique index if not exists kol_collab_source_key_uidx
  on kol_collaboration_history(source_key) where source_key is not null;
create index if not exists kol_collab_month_idx  on kol_collaboration_history(month_key);
create index if not exists kol_collab_status_idx on kol_collaboration_history(status);
create index if not exists kol_collab_brand_idx  on kol_collaboration_history(brand);

-- ── kol_engagement_posts — 1 row per platform post ──────────────────────
-- The sheet keeps IG/TikTok/FB/Lemon8 reach and engagement in separate column
-- pairs, and a separate link column per platform. One row each here instead,
-- so a KOL who posts on three platforms produces three comparable records.
create table if not exists kol_engagement_posts (
  post_id     uuid primary key default gen_random_uuid(),
  collab_id   uuid not null references kol_collaboration_history(collab_id) on delete cascade,
  platform    text,                               -- Instagram | TikTok | Facebook | YouTube | Lemon8
  post_url    text,
  posted_at   date,
  reach       numeric,
  engagement  numeric,
  saves       numeric,
  shares      numeric,
  data        jsonb,
  created_at  timestamptz default now()
);
create index if not exists kol_posts_collab_idx on kol_engagement_posts(collab_id);
-- one post per (engagement, platform) — matches how the sheet stores it
create unique index if not exists kol_posts_collab_platform_uidx
  on kol_engagement_posts(collab_id, platform);

-- ── kol_rate_cards — what we can actually buy, and on what terms ────────
-- Replaces the single free-text rate. The terms below are all real examples
-- pulled out of the sheet's "Why Good?" column, which is where the team has
-- been hiding them: boost fees, gen-code fees, revision limits, lead times.
create table if not exists kol_rate_cards (
  rate_id        uuid primary key default gen_random_uuid(),
  kol_id         uuid not null references kol_profiles(kol_id) on delete cascade,
  platforms      text[],        -- ['Instagram','TikTok'] — บางเรทเป็นแพ็กรวมหลายช่อง
  deliverable    text,          -- Reel | Photo Album | Video <1min | Story | Package
  price_thb      numeric,
  price_max_thb  numeric,       -- ใช้เมื่อเรทเป็นช่วง เช่น 12,000-15,000
  lead_time_days int,
  revisions      int,           -- แก้ได้กี่ครั้ง (0 = ไม่รับแก้)
  accepts_brief  boolean,       -- บางเพจ "ไม่รับบรีฟ"
  boost_included boolean,
  boost_fee_thb  numeric,       -- ค่ายิงแอดถ้าให้เพจยิงเอง
  gen_code_fee_thb numeric,     -- ค่าทำโค้ดส่วนลด
  company_markup_pct numeric,   -- เช่น +20% ถ้าจ่ายผ่านบริษัท
  notes          text,
  is_current     boolean default true,
  quoted_at      date,
  data           jsonb,
  created_at     timestamptz default now()
);
create index if not exists kol_rate_cards_kol_idx on kol_rate_cards(kol_id);
create index if not exists kol_rate_cards_current_idx on kol_rate_cards(kol_id) where is_current;

-- ── kol_notes — what the specialist knows that no column captures ──────
-- Free notes on a creator, or on one specific booking. This is the pressure
-- valve that keeps structured fields structured: the sheet's "Why Good?" column
-- became a dumping ground for deal terms precisely because there was nowhere
-- else to write anything down.
create table if not exists kol_notes (
  note_id    uuid primary key default gen_random_uuid(),
  kol_id     uuid not null references kol_profiles(kol_id) on delete cascade,
  collab_id  uuid references kol_collaboration_history(collab_id) on delete cascade,
  body       text not null,
  author     text,
  created_at timestamptz default now()
);
create index if not exists kol_notes_kol_idx on kol_notes(kol_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- kol_scorecard_view — everything the Library table and the matcher need,
-- computed from real engagements. This is what turns "302 names" into
-- "302 names we know something about".
-- ═══════════════════════════════════════════════════════════════════════
-- Dropped rather than replaced: adding is_partner shifts the column order, and
-- CREATE OR REPLACE VIEW refuses to renumber existing columns.
drop view if exists kol_scorecard_view;
create view kol_scorecard_view with (security_invoker = on) as
with agg as (
  select
    h.kol_id,
    count(*)                                                as times_used,
    count(*) filter (where h.status = 'Resulted')           as times_resulted,
    count(*) filter (where h.status = 'Cancel')             as times_cancelled,
    max(coalesce(h.posted_at, h.visited_at))                as last_used_at,
    min(coalesce(h.posted_at, h.visited_at))                as first_used_at,
    array_agg(distinct h.brand) filter (where h.brand is not null)  as brands_used,
    array_agg(distinct h.branch) filter (where h.branch is not null) as branches_used,
    sum(h.actual_reach)                                     as total_reach,
    sum(h.actual_engagement)                                as total_engagement,
    sum(h.total_cost)                                       as total_cost,
    avg(h.brand_feedback_score)                             as avg_feedback,
    -- reliability counts only the deliveries we could actually judge
    avg((h.on_time_delivery)::int) filter (where h.on_time_delivery is not null) as on_time_rate,
    count(*) filter (where h.on_time_delivery is false) as late_by_kol,
    count(*) filter (where h.posted_at is not null and h.agreed_post_at is not null
                       and h.posted_at > h.agreed_post_at and h.delay_reason is null) as late_unattributed
  from kol_collaboration_history h
  group by h.kol_id
)
select
  p.kol_id,
  p.display_name,
  p.kol_type,
  p.tier,
  p.status,
  p.contact_agency,
  p.is_partner,
  p.data->'brand_fit'                    as brand_fit,
  ch.total_followers,
  ch.channels,
  rc.rate_min_thb,
  rc.rate_max_thb,
  coalesce(a.times_used, 0)              as times_used,
  a.times_resulted,
  a.times_cancelled,
  a.last_used_at,
  a.first_used_at,
  a.brands_used,
  a.branches_used,
  a.total_reach,
  a.total_engagement,
  a.total_cost,
  -- the three numbers that should drive every buying decision
  case when coalesce(a.total_reach,0) > 0
       then round(a.total_cost / a.total_reach, 4) end      as cost_per_reach,
  case when coalesce(a.total_engagement,0) > 0
       then round(a.total_cost / a.total_engagement, 2) end as cost_per_engagement,
  case when coalesce(ch.total_followers,0) > 0 and a.total_reach is not null
       then round(a.total_reach / ch.total_followers, 2) end as reach_per_follower,
  case when coalesce(a.total_reach,0) > 0
       then round(a.total_engagement / a.total_reach * 100, 2) end as engagement_rate,
  a.avg_feedback, a.on_time_rate, a.late_by_kol, a.late_unattributed,
  -- "ยังไม่ทดลอง" — the 191 profiles nobody has ever booked
  (coalesce(a.times_used, 0) = 0)        as never_used,
  r.rank_score,
  r.rank_label
from kol_profiles p
left join agg a on a.kol_id = p.kol_id
left join lateral (
  select
    sum(followers) as total_followers,
    -- oldest confirmation across the creator's channels: a profile is only as
    -- trustworthy as its least recently checked number
    min(last_synced_at) as followers_checked_at,
    jsonb_agg(jsonb_build_object(
      'channel_id', channel_id, 'platform', platform, 'followers', followers,
      'url', handle_url, 'checked_at', last_synced_at
    ) order by followers desc nulls last) as channels
  from kol_channels where kol_id = p.kol_id
) ch on true
left join lateral (
  select min(price_thb) as rate_min_thb,
         max(coalesce(price_max_thb, price_thb)) as rate_max_thb
  from kol_rate_cards where kol_id = p.kol_id and is_current
) rc on true
left join kol_rank_scores r on r.kol_id = p.kol_id;

-- ═══════════════════════════════════════════════════════════════════════
-- kol_tier_benchmark_view — what a tier normally costs us per reach.
-- Feeds the "you are about to overpay" warning at approval time. Derived from
-- our own history, so it self-corrects as more engagements land.
-- ═══════════════════════════════════════════════════════════════════════
create or replace view kol_tier_benchmark_view with (security_invoker = on) as
select
  p.tier,
  count(*)                                              as samples,
  sum(h.actual_reach)                                   as total_reach,
  sum(h.total_cost)                                     as total_cost,
  case when sum(h.actual_reach) > 0
       then round(sum(h.total_cost) / sum(h.actual_reach), 4) end as cost_per_reach,
  case when sum(h.actual_engagement) > 0
       then round(sum(h.total_cost) / sum(h.actual_engagement), 2) end as cost_per_engagement
from kol_collaboration_history h
join kol_profiles p on p.kol_id = h.kol_id
where coalesce(h.actual_reach, 0) > 0
group by p.tier;

-- ═══════════════════════════════════════════════════════════════════════
-- RLS — staff/admin only, same rule security_p1.sql already applies to
-- kol_profiles / kol_channels / kol_collaboration_history. NOT the demo-open
-- policy kol_master.sql ships with: these tables hold what we paid each
-- creator, so a `using (true)` policy would expose rate cards and fees to any
-- anon caller holding the publishable key.
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['kol_engagement_posts','kol_rate_cards','kol_notes'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists demo_all on %I;', t);
    execute format('drop policy if exists staff_rw on %I;', t);
    execute format($f$create policy staff_rw on %I for all
      using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
      with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));$f$, t);
  end loop;
end $$;
