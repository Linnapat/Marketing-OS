-- ── Migration tracking ────────────────────────────────────────────────────
--
-- There are 40+ files in this folder and, until now, no record of which had
-- been run. "Did we apply security_p7?" was answered from memory, and the only
-- reason nothing broke is that every file is written to be re-runnable.
--
-- This is the ledger. Each migration ends by recording itself, so `select * from
-- schema_migrations order by applied_at` answers the question for good.
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.

create table if not exists schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now(),
  -- Who ran it, when it can be known. Supabase's SQL Editor runs as the
  -- postgres role, so this is usually 'postgres' rather than a person — still
  -- worth having for migrations applied from a client session.
  applied_by text not null default current_user,
  note       text
);

alter table schema_migrations enable row level security;
-- Readable by any signed-in user (knowing which migrations ran is not
-- sensitive, and the app degrades on missing columns rather than guessing).
-- Writes come from the SQL Editor as postgres, which bypasses RLS.
drop policy if exists read_migrations on schema_migrations;
create policy read_migrations on schema_migrations for select
  using (auth.role() = 'authenticated');

/** Record a migration as applied. Call at the END of each file:
 *    select record_migration('soft_delete_trash.sql');
 *  Re-running a file just refreshes applied_at, so it stays idempotent. */
create or replace function record_migration(p_filename text, p_note text default null)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into schema_migrations (filename, note)
  values (p_filename, p_note)
  on conflict (filename) do update set applied_at = now(), note = coalesce(excluded.note, schema_migrations.note);
$$;

-- ── Backfill: what is demonstrably already applied ───────────────────────
-- Recorded by DETECTING the objects each migration creates, not by trusting a
-- list — a hand-written list would be the same guesswork this table exists to
-- replace. Only migrations whose result is unmistakable are backfilled; the
-- rest simply record themselves the next time they run.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='content_posts' and column_name='deleted_at')
    then perform record_migration('soft_delete_trash.sql', 'backfilled: deleted_at present'); end if;
  if exists (select 1 from information_schema.columns where table_name='workflow_state' and column_name='tasks')
    then perform record_migration('workflow_custom_tasks.sql', 'backfilled: workflow_state.tasks present'); end if;
  if exists (select 1 from information_schema.columns where table_name='expense_requests' and column_name='wht_rate')
    then perform record_migration('expense_wht_rate.sql', 'backfilled: wht_rate present'); end if;
  if exists (select 1 from information_schema.columns where table_name='expense_requests' and column_name='ref')
    then perform record_migration('expenses_p1.sql', 'backfilled: expense_requests.ref present'); end if;
  if exists (select 1 from pg_proc where proname='brand_visible')
    then perform record_migration('security_p9_brand_scope.sql', 'backfilled: brand_visible() present'); end if;
  if exists (select 1 from pg_tables where tablename='workflow_state')
    then perform record_migration('workflow_state.sql', 'backfilled: table present'); end if;
  if exists (select 1 from pg_tables where tablename='team_kpi_months')
    then perform record_migration('team_kpi.sql', 'backfilled: table present'); end if;
end $$;

select record_migration('schema_migrations.sql');
