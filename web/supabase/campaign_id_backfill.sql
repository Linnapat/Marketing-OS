-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — give tasks and expense_requests a real campaign_id
--
-- Prerequisite for the Status Dashboard, which groups every work item under
-- its campaign. content_posts / graphic_requests / kols already carry
-- campaign_id on 100% of rows; tasks and expense_requests did not:
--
--   tasks             85 rows · campaign_id column exists but is NULL on all 85
--   expense_requests  19 rows · no campaign_id column at all
--
-- Both only stored the campaign NAME as free text, which breaks the moment a
-- campaign is renamed — the work silently drops out of its campaign.
--
-- Matching is on the name with case, spaces and punctuation stripped, which
-- resolves 98 of 104 rows. The remaining 6 names match no campaign and were
-- mapped by hand with the CMO (2026-07-26):
--
--   'CPN01_KCC'                → CAM-2026-5945  CPN018_KCC (KEEP CLIMBING CLUB)
--   'CPN01_Branding_ Sit.Done' → CAM-2026-2751  CPN01 Branding Sit and done
--   'Must Eat_Kani festival'   → CAM-2026-4856  OMD-20260901-003 — Kani Seasonal
--
-- The `campaign` text column is deliberately KEPT: it is what the existing
-- pages render, and dropping it here would be a breaking change unrelated to
-- the backfill. Treat campaign_id as the join key from now on.
--
-- Idempotent: only fills rows where campaign_id is still null. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.expense_requests add column if not exists campaign_id text;

with norm as (
  select id, regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as k
  from public.campaigns
),
ovr(raw, cid) as (values
  ('CPN01_KCC',                'CAM-2026-5945'),
  ('CPN01_Branding_ Sit.Done', 'CAM-2026-2751'),
  ('Must Eat_Kani festival',   'CAM-2026-4856')
)
update public.tasks t
set campaign_id = coalesce(
      (select cid from ovr where raw = t.campaign),
      (select id from norm where k = regexp_replace(lower(t.campaign), '[^a-z0-9]', '', 'g'))
    )
where t.campaign_id is null;

with norm as (
  select id, regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as k
  from public.campaigns
),
ovr(raw, cid) as (values
  ('CPN01_KCC',                'CAM-2026-5945'),
  ('CPN01_Branding_ Sit.Done', 'CAM-2026-2751'),
  ('Must Eat_Kani festival',   'CAM-2026-4856')
)
update public.expense_requests e
set campaign_id = coalesce(
      (select cid from ovr where raw = e.campaign),
      (select id from norm where k = regexp_replace(lower(e.campaign), '[^a-z0-9]', '', 'g'))
    )
where e.campaign_id is null;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY — both must report 0 unresolved and 0 pointing at a missing campaign:
--
--   select 'tasks' t, count(*) total, count(campaign_id) filled,
--          count(*) filter (where campaign_id is null) unresolved,
--          count(*) filter (where campaign_id is not null
--            and campaign_id not in (select id from public.campaigns)) dangling
--   from public.tasks
--   union all select 'expense_requests', count(*), count(campaign_id),
--          count(*) filter (where campaign_id is null),
--          count(*) filter (where campaign_id is not null
--            and campaign_id not in (select id from public.campaigns))
--   from public.expense_requests;
--
-- ROLLBACK (clears the backfill; the column on expense_requests is left in
-- place because dropping it would lose any value written after this ran):
--   update public.tasks set campaign_id = null;
--   update public.expense_requests set campaign_id = null;
-- ═══════════════════════════════════════════════════════════════════════
