-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — shared app settings (key/value)
-- Run once in Supabase → SQL Editor. Stores team-wide settings such as the
-- Finance monthly-budget Google Sheet URL, so every Finance user reads the
-- same sheet.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;
drop policy if exists demo_all on app_settings;
create policy demo_all on app_settings for all using (true) with check (true);
