-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — shared campaign types
-- Run once in Supabase → SQL Editor. Stores team-wide custom campaign types
-- that admins add from the New Campaign form (everyone sees them in the
-- dropdown). The built-in defaults live in code and don't need a row here.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists campaign_types (
  name       text primary key,
  created_at timestamptz default now()
);

alter table campaign_types enable row level security;
drop policy if exists demo_all on campaign_types;
create policy demo_all on campaign_types for all using (true) with check (true);

-- To enforce "admins only" at the database level once Supabase Auth is on,
-- replace demo_all with:
--   create policy read_types  on campaign_types for select using (true);
--   create policy write_types on campaign_types for all
--     using (app_role() = 'admin') with check (app_role() = 'admin');
