-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Campaign Brief builder
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- The flexible Campaign Brief (overview, guideline state, content plan, KOL
-- plan, budget allocation, approval log) is stored whole in campaigns.data
-- (jsonb) so the multi-step builder round-trips losslessly, while the brief's
-- content items / graphics / KOLs / tasks are ALSO written to their own módules
-- (content_posts, graphic_requests, kols, tasks) so every module sees them.
--
-- Finance is intentionally NOT touched: budget allocation lives on the brief
-- only and does not create expense_requests.
-- ═══════════════════════════════════════════════════════════════════════

-- schema_v2.sql already adds `data jsonb` to every table; this guarantees it
-- for the campaigns table specifically in case v2 wasn't applied.
alter table campaigns add column if not exists data jsonb;

-- Tasks auto-created from a brief carry links back to the source. These columns
-- are optional (the full task object is also in tasks.data) but make relational
-- queries possible later.
alter table tasks add column if not exists related_brief text;
alter table tasks add column if not exists related_graphic_id text;
alter table tasks add column if not exists channel text;
