-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — KOL / Influencer MASTER database
-- Run once in Supabase → SQL Editor (Dashboard → SQL → New query). Safe to re-run.
--
-- WHY THIS EXISTS
--   The existing `kols` table (schema.sql) is CAMPAIGN-SCOPED: one row = one KOL
--   inside one campaign request, and pages are seeded with `@tbd` handles. This
--   file adds a campaign-INDEPENDENT master database so every real page/creator
--   is stored once, reused across campaigns, and accumulates performance history
--   used to rank how suitable each page is.
--
--   Four entities (per spec):
--     kol_profiles              — the KOL / page (1 row per creator)
--     kol_channels              — their platforms          (1 profile → many)
--     kol_collaboration_history — past real collabs         (1 profile → many)   ← source of Rank
--     kol_rank_scores           — cached computed Rank       (1 profile → 1)
--
--   The campaign-scoped `kols` table stays as-is; a new nullable `kol_id` column
--   links each campaign request back to the master profile (see bottom).
--
--   Conventions match schema.sql: text PKs for brands/campaigns, `data jsonb`
--   round-trip column, and demo-open RLS you tighten before launch.
-- ═══════════════════════════════════════════════════════════════════════

-- gen_random_uuid() lives in pgcrypto; enabled by default on Supabase, but be safe.
create extension if not exists pgcrypto;

-- ── Entity 1: kol_profiles — the master profile ────────────────────────
create table if not exists kol_profiles (
  kol_id           uuid primary key default gen_random_uuid(),
  display_name     text not null,                       -- ชื่อ KOL / เพจ
  kol_type         text,                                -- Food Blogger | Food Vlogger | Micro Influencer | Foodie (จากฟอร์มเดิม)
  tier             text,                                -- Nano | Micro | Mid | Macro | Mega  (แบ่งตาม follower range)
  status           text default 'Active',               -- Active | Inactive | Blacklisted
  owner_specialist text references members(email),      -- Specialist ที่ดูแลความสัมพันธ์กับ KOL รายนี้
  contact_agency   text,                                -- เอเจนซี่ / ผู้ติดต่อ (ถ้ามี)
  notes            text,
  data             jsonb,                               -- lossless round-trip for the UI (matches schema_v2.sql pattern)
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists kol_profiles_tier_idx   on kol_profiles(tier);
create index if not exists kol_profiles_status_idx on kol_profiles(status);
-- case-insensitive search by page name for the "Request KOL" picker
create index if not exists kol_profiles_name_idx   on kol_profiles(lower(display_name));

-- ── Entity 2: kol_channels — platforms (1 profile → many) ──────────────
create table if not exists kol_channels (
  channel_id           uuid primary key default gen_random_uuid(),
  kol_id               uuid not null references kol_profiles(kol_id) on delete cascade,
  platform             text,                             -- Instagram | TikTok | Facebook | YouTube | X
  handle_url           text,                             -- @handle หรือ URL จริง (แทน @tbd)
  followers            numeric,                          -- จำนวนผู้ติดตามล่าสุด
  avg_reach            numeric,                          -- reach เฉลี่ยต่อโพสต์
  avg_engagement_rate  numeric,                          -- engagement rate เฉลี่ย (%) — เก็บเป็น 4.2 = 4.2%
  content_style        text,
  audience_demographic jsonb,                            -- { age:{...}, gender:{...}, geo:{...} } สำหรับเช็ค audience fit
  last_synced_at       timestamptz,
  created_at           timestamptz default now()
);
create index if not exists kol_channels_kol_idx on kol_channels(kol_id);
-- one row per (profile, platform); re-syncs should upsert, not duplicate
create unique index if not exists kol_channels_kol_platform_uidx
  on kol_channels(kol_id, platform);

-- ── Entity 3: kol_collaboration_history — past collabs (source of Rank) ─
create table if not exists kol_collaboration_history (
  collab_id            uuid primary key default gen_random_uuid(),
  kol_id               uuid not null references kol_profiles(kol_id) on delete cascade,
  campaign_id          text references campaigns(id),    -- แคมเปญที่เคยร่วมงาน
  brand                text references brands(id),
  fee_paid             numeric,                          -- ค่าตัวที่จ่ายจริง
  deliverables         text,                             -- เช่น 1 Reel + 3 Stories
  actual_reach         numeric,                          -- reach จริงหลังโพสต์
  actual_engagement    numeric,                          -- engagement จริง
  roas                 numeric,                          -- ผลตอบแทนแคมเปญนั้น (ถ้าวัดได้)
  on_time_delivery     boolean,                          -- ส่งงานตรงเวลาหรือไม่
  brand_feedback_score int check (brand_feedback_score between 1 and 5),  -- 1–5
  data                 jsonb,
  created_at           timestamptz default now()
);
create index if not exists kol_collab_kol_idx      on kol_collaboration_history(kol_id);
create index if not exists kol_collab_campaign_idx on kol_collaboration_history(campaign_id);

-- ── Entity 4: kol_rank_scores — cached computed Rank (1 profile → 1) ────
create table if not exists kol_rank_scores (
  kol_id          uuid primary key references kol_profiles(kol_id) on delete cascade,
  rank_score      numeric check (rank_score between 0 and 100),  -- คะแนนรวม (base, audience-fit ยังไม่รวม — ดูหมายเหตุด้านล่าง)
  rank_label      text,                                          -- S | A | B | C  (map จาก rank_score)
  score_breakdown jsonb,                                         -- คะแนนย่อยแต่ละเกณฑ์ + weights ที่ใช้
  calculated_at   timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Rank weights — one editable row. Adjust weights any time, then recompute.
-- audience_fit ถูกกันไว้ต่างหากเพราะ "เหมาะกับ target audience ของแบรนด์ไหน"
-- ขึ้นกับแบรนด์/แคมเปญที่จะใช้งาน → คำนวณตอนเลือก KOL ไม่ใช่ตอน cache.
-- คะแนน cache (rank_score) = ผลรวมถ่วงน้ำหนักของ 4 องค์ประกอบที่เป็นคุณสมบัติติดตัว
-- (engagement, on-time, feedback, budget-efficiency) renormalize ให้เต็ม 100.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists kol_rank_weights (
  id                    int primary key default 1 check (id = 1),
  w_engagement          numeric default 25,   -- engagement rate เทียบ tier เดียวกัน
  w_on_time             numeric default 20,   -- ความสม่ำเสมอส่งงานตรงเวลา
  w_brand_feedback      numeric default 20,   -- brand feedback score เฉลี่ย
  w_budget_efficiency   numeric default 20,   -- reach/ROAS ต่อบาทที่จ่าย
  w_audience_fit        numeric default 15,   -- ใช้ตอนเลือก (ไม่รวมใน cache)
  target_roas           numeric default 3,    -- ROAS ที่ถือว่า "ดีเต็ม" สำหรับ budget-efficiency
  updated_at            timestamptz default now()
);
insert into kol_rank_weights (id) values (1) on conflict (id) do nothing;

-- ── recompute_kol_rank(kol) — คำนวณ 4 องค์ประกอบติดตัว แล้ว upsert เข้า cache ─
-- คืนค่า rank_score (0–100). เรียกหลังมี collab ใหม่ หรือหลัง sync followers.
create or replace function recompute_kol_rank(p_kol uuid)
returns numeric
language plpgsql
as $$
declare
  w              kol_rank_weights%rowtype;
  v_tier         text;
  v_er           numeric;   -- avg engagement rate ของ KOL รายนี้ (ข้ามทุก channel)
  v_tier_er      numeric;   -- avg engagement rate ของ tier เดียวกัน (baseline)
  s_engagement   numeric := 0;
  s_on_time      numeric := 0;
  s_feedback     numeric := 0;
  s_efficiency   numeric := 0;
  wsum           numeric := 0;
  v_score        numeric := 0;
  v_label        text;
begin
  select * into w from kol_rank_weights where id = 1;
  select tier into v_tier from kol_profiles where kol_id = p_kol;

  -- 1) Engagement vs tier: 50 = ค่าเฉลี่ย tier, 100 = สองเท่าของค่าเฉลี่ย
  select avg(avg_engagement_rate) into v_er   from kol_channels where kol_id = p_kol;
  select avg(avg_engagement_rate) into v_tier_er
    from kol_channels c join kol_profiles p on p.kol_id = c.kol_id
    where p.tier is not distinct from v_tier;
  if v_er is not null and coalesce(v_tier_er,0) > 0 then
    s_engagement := least(100, greatest(0, (v_er / v_tier_er) * 50));
  end if;

  -- 2) On-time consistency: สัดส่วน collab ที่ส่งตรงเวลา
  select coalesce(avg((on_time_delivery)::int) * 100, 0) into s_on_time
    from kol_collaboration_history where kol_id = p_kol and on_time_delivery is not null;

  -- 3) Brand feedback: เฉลี่ย 1–5 → 0–100
  select coalesce(avg(brand_feedback_score) / 5.0 * 100, 0) into s_feedback
    from kol_collaboration_history where kol_id = p_kol and brand_feedback_score is not null;

  -- 4) Budget efficiency: avg ROAS เทียบ target (target_roas = 100 คะแนน)
  select coalesce(least(100, avg(roas) / nullif(w.target_roas,0) * 100), 0) into s_efficiency
    from kol_collaboration_history where kol_id = p_kol and roas is not null;

  -- ถ่วงน้ำหนัก + renormalize เฉพาะองค์ประกอบที่มีข้อมูลจริง (กัน KOL หน้าใหม่โดนลงโทษ)
  if v_er is not null and coalesce(v_tier_er,0) > 0 then
    v_score := v_score + s_engagement * w.w_engagement; wsum := wsum + w.w_engagement;
  end if;
  if exists (select 1 from kol_collaboration_history where kol_id = p_kol and on_time_delivery is not null) then
    v_score := v_score + s_on_time    * w.w_on_time;    wsum := wsum + w.w_on_time;
  end if;
  if exists (select 1 from kol_collaboration_history where kol_id = p_kol and brand_feedback_score is not null) then
    v_score := v_score + s_feedback   * w.w_brand_feedback; wsum := wsum + w.w_brand_feedback;
  end if;
  if exists (select 1 from kol_collaboration_history where kol_id = p_kol and roas is not null) then
    v_score := v_score + s_efficiency * w.w_budget_efficiency; wsum := wsum + w.w_budget_efficiency;
  end if;

  v_score := case when wsum > 0 then round(v_score / wsum, 1) else 0 end;

  v_label := case
    when v_score >= 80 then 'S'
    when v_score >= 65 then 'A'
    when v_score >= 45 then 'B'
    else 'C' end;

  insert into kol_rank_scores (kol_id, rank_score, rank_label, score_breakdown, calculated_at)
  values (
    p_kol, v_score, v_label,
    jsonb_build_object(
      'engagement_vs_tier', round(s_engagement,1),
      'on_time',            round(s_on_time,1),
      'brand_feedback',     round(s_feedback,1),
      'budget_efficiency',  round(s_efficiency,1),
      'weights_used',       to_jsonb(w),
      'note',               'audience_fit applied at selection time against a specific brand target'
    ),
    now()
  )
  on conflict (kol_id) do update set
    rank_score = excluded.rank_score,
    rank_label = excluded.rank_label,
    score_breakdown = excluded.score_breakdown,
    calculated_at = excluded.calculated_at;

  return v_score;
end $$;

-- Recompute everyone at once (run after a weights change or a bulk sync).
create or replace function recompute_all_kol_ranks()
returns int language sql as $$
  select count(recompute_kol_rank(kol_id))::int from kol_profiles;
$$;

-- ── kol_master_view — one flat row per KOL for the "Request KOL" picker ─
-- รวม profile + สรุป channel (platform หลัก + followers รวม) + rank ล่าสุด
create or replace view kol_master_view as
select
  p.kol_id,
  p.display_name,
  p.kol_type,
  p.tier,
  p.status,
  p.owner_specialist,
  p.contact_agency,
  ch.total_followers,
  ch.platforms,
  ch.primary_handle,
  r.rank_score,
  r.rank_label,
  r.calculated_at as rank_calculated_at
from kol_profiles p
left join lateral (
  select
    sum(followers)                                            as total_followers,
    array_agg(distinct platform)                              as platforms,
    (array_agg(handle_url order by followers desc nulls last))[1] as primary_handle
  from kol_channels where kol_id = p.kol_id
) ch on true
left join kol_rank_scores r on r.kol_id = p.kol_id;

-- ── Link the existing campaign-scoped `kols` table to the master ───────
-- นับจากนี้ KOL request ในแคมเปญควรอ้าง kol_id ของ master profile แทน @tbd.
-- (ยัง nullable เพื่อไม่กระทบข้อมูล/ฟอร์มเดิม จนกว่าจะ migrate เสร็จ)
alter table kols add column if not exists kol_id uuid references kol_profiles(kol_id);
create index if not exists kols_master_kol_idx on kols(kol_id);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS — demo-open policies (match schema.sql). Tighten before launch.
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'kol_profiles','kol_channels','kol_collaboration_history',
    'kol_rank_scores','kol_rank_weights'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists demo_all on %I;', t);
    execute format('create policy demo_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PRODUCTION: replace demo_all with role-aware rules, e.g. only the
-- owner_specialist (or Admin) may edit a profile; everyone authenticated may
-- read master + rank for the picker. Keep kol_collaboration_history writable
-- only by KOL Team + Finance.
-- ═══════════════════════════════════════════════════════════════════════
