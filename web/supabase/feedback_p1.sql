-- Persist KOL comments and graphic feedback (audit P2-5). Previously the
-- "Resolve ✓" button in the KOL Comments tab and the Graphic Feedback tab only
-- flipped browser state — a refresh lost it. These tables back both, so resolves
-- and newly added comments survive. Applied to production on 2026-07-16.
-- Safe to re-run.

create table if not exists kol_comments (
  id           bigint generated always as identity primary key,
  kol_id       bigint not null,          -- references kols.id (live campaign KOL row)
  type         text,
  text         text not null,
  owner        text,
  owner_team   text,
  owner_color  text,
  assigned_to  text,
  status       text not null default 'Open',
  related_item text,
  due          text,
  created_at   timestamptz not null default now()
);
create index if not exists kol_comments_kol_idx on kol_comments (kol_id, created_at desc);

create table if not exists graphic_feedback (
  id           bigint generated always as identity primary key,
  gid          bigint not null,          -- references graphic_requests.id
  owner        text,
  team         text,
  owner_color  text,
  type         text,
  text         text not null,
  version      text,
  status       text not null default 'Open',
  assigned_to  text,
  due          text,
  created_at   timestamptz not null default now()
);
create index if not exists graphic_feedback_gid_idx on graphic_feedback (gid, created_at desc);

alter table kol_comments enable row level security;
alter table graphic_feedback enable row level security;

drop policy if exists staff_rw on kol_comments;
create policy staff_rw on kol_comments for all
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

drop policy if exists staff_rw on graphic_feedback;
create policy staff_rw on graphic_feedback for all
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff'));
