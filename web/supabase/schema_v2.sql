-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — schema v2 (run AFTER schema.sql, then re-seed once)
--
-- Adds a `data jsonb` column to every table so modules with rich UI objects
-- (Content, Tasks, KOL, Graphic, Workload…) can round-trip every field without
-- losing anything. Simple modules ignore it. Idempotent & safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'brands','campaigns','tasks','content_posts','graphic_requests','kols',
    'budget_items','expenses','expense_requests','pnl','requests','assets',
    'workload_members','members','permissions','org_settings','workflow_tasks',
    'agency_tasks','promotion_summary_items'
  ] loop
    execute format('alter table %I add column if not exists data jsonb;', t);
  end loop;
end $$;
