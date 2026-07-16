-- Real audit trail (audit P2-3). The Settings → Audit Log tab used to show static
-- mock rows; this table backs it with actual events written by the app.
-- Applied to production on 2026-07-16. Safe to re-run.
create table if not exists audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_email  text,
  actor_name   text,
  action       text not null,   -- human-readable, e.g. "อนุมัติเบิกงบ REQ-2026-ABCDE"
  module       text,            -- "Finance" | "Campaign" | "Settings" | ...
  before_text  text,
  after_text   text,
  meta         jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);

alter table audit_log enable row level security;
drop policy if exists staff_rw on audit_log;
create policy staff_rw on audit_log for all
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));
