-- Promotion Summary Print — manual/synced rows shared across the team.
-- Safe to re-run in Supabase SQL Editor.

create table if not exists promotion_summary_items (
  id          text primary key,
  brand       text references brands(id),
  category    text not null,
  title       text not null,
  description text not null default '',
  pos_name    text,
  branches    text[] default '{}',
  start_date  text not null,
  end_date    text,
  status      text not null default 'active',
  source      text not null default 'manual',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table promotion_summary_items enable row level security;
drop policy if exists demo_all on promotion_summary_items;
create policy demo_all on promotion_summary_items for all using (true) with check (true);

