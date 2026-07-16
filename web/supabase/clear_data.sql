-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — CLEAR ALL DATA (fresh start for the team rollout)
-- Run once in Supabase → SQL Editor.  ⚠️ DESTRUCTIVE — review before running.
--
-- Empties every data table so the team starts from zero, then re-seeds only the
-- two things the app cannot run without and has NO in-app UI to recreate:
--   • the 4 fixed TEPPEN Group brands  (every module FK-references brands.id)
--   • one Admin member                 (so you can log in and set up the team)
--
-- Everything else is wiped: campaigns, KOL, graphic, content, tasks, expenses,
-- expense requests, P&L, requests, assets, workload, workflow, agency tasks,
-- the KOL master DB, the sample team (members), permission overrides, org settings.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Wipe all data. `cascade` also clears FK-dependent rows; `restart identity`
--    resets auto-increment ids. `to_regclass` skips tables that don't exist yet
--    (e.g. if kol_master.sql was never run), so the whole script still succeeds.
do $$
declare t text;
begin
  foreach t in array array[
    'campaigns','tasks','content_posts','graphic_requests','kols',
    'budget_items','expenses','expense_requests','pnl','requests','assets',
    'workload_members','workflow_tasks','agency_tasks','promotion_summary_items',
    'kol_profiles','kol_channels','kol_collaboration_history',
    'kol_rank_scores','kol_rank_weights',
    'members','permissions','org_settings','brands'
  ] loop
    if to_regclass(t) is not null then
      execute format('truncate table %I restart identity cascade;', t);
    end if;
  end loop;
end $$;

-- 2) Re-seed the 4 fixed brands — structural, required by every FK reference.
insert into brands (id, name, color) values
  ('teppen',   'TEPPEN',      '#B33A2E'),
  ('omakase',  'Omakase Don', '#3E5C9A'),
  ('mainichi', 'Mainichi',    '#4E7A4E'),
  ('touka',    'Touka',       '#C68A1E');

-- 3) Re-seed ONE admin so you keep full access (Finance, Settings, approvals).
--    ⚠️ REQUIRED: replace the placeholders below with YOUR real login email and
--    name before running — a signed-in user with no members row falls back to a
--    limited role. Do not commit a real personal email into this shared script.
insert into members (email, name, role, access, brand_access, status)
values ('admin@example.com', 'Admin', 'CMO', 'Admin', 'All brands', 'Active');

-- 4) (Optional) restore the default KOL rank-weights row, only if the master DB
--    schema (kol_master.sql) has been applied.
do $$
begin
  if to_regclass('kol_rank_weights') is not null then
    insert into kol_rank_weights (id) values (1) on conflict (id) do nothing;
  end if;
end $$;

-- Done. Now add the real team via Settings → Users & Roles, and configure the
-- Permissions matrix there. The 4 brands above are fixed; edit names/colors only
-- if the brand line-up ever changes.
