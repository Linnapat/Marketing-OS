-- Work Calendar state — persists the admin's per-month cell overrides and the
-- team's done-checkmarks (previously browser-memory only, lost on refresh).
-- Single shared row; keys inside the blobs are "YYYY-M::section::task[::day]".
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.

create table if not exists workflow_state (
  id         integer primary key default 1 check (id = 1),
  overrides  jsonb default '{}'::jsonb,
  done       jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table workflow_state enable row level security;
drop policy if exists demo_all on workflow_state;
create policy demo_all on workflow_state for all using (true) with check (true);
-- (security_p1.sql replaces demo_all with the staff/admin-only policy.)
