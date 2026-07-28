-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Team KPI review (Performance Center → Team KPI)
--
-- One row per month holding the whole review: the people being reviewed and
-- their per-KPI Target / Actual / Manual score. The app computes Achievement%,
-- the 120% cap, weighted scores and the multiplier band from KPI_Template
-- (src/lib/data/teamKpi.ts) — nothing derived is stored, so a rule change
-- re-reads every past month correctly.
--
-- Why its own table and not org_settings: org_read lets ANY authenticated staff
-- read every org_settings key (security_p6.sql). An individual's KPI rating is
-- not team-wide reading, so this table is admin-only for both select and write
-- — the CMO seat reviews, nobody else can query the rows.
--
-- No salary, no bonus: the review screen shows performance only. Bonus is still
-- calculated in the Marketing KPI Bonus Calculator sheet, where salary lives.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.team_kpi_reviews (
  month      text primary key,                    -- 'YYYY-MM'
  payload    jsonb not null default '{}'::jsonb,   -- { people: [...], inputs: {...} }
  updated_at timestamptz not null default now()
);

alter table public.team_kpi_reviews enable row level security;

revoke all on public.team_kpi_reviews from anon;
grant select, insert, update, delete on public.team_kpi_reviews to authenticated;

drop policy if exists team_kpi_admin_all on public.team_kpi_reviews;
create policy team_kpi_admin_all on public.team_kpi_reviews for all
  using (auth.role() = 'authenticated' and app_role() = 'admin')
  with check (auth.role() = 'authenticated' and app_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY after applying:
--   as admin: insert into team_kpi_reviews(month,payload)
--               values('2026-07','{}'::jsonb)
--               on conflict (month) do update set payload = excluded.payload;  -- 1 row
--   as staff: select set_config('request.jwt.claims',
--               '{"role":"authenticated","member_role":"Content Creator"}', true);
--             select * from team_kpi_reviews;                                   -- 0 rows
--
-- ROLLBACK:
--   drop policy if exists team_kpi_admin_all on public.team_kpi_reviews;
--   drop table if exists public.team_kpi_reviews;
-- ═══════════════════════════════════════════════════════════════════════
