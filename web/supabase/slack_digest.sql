-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Slack per-person DMs + the daily channel digest
--
-- Assign / revise notifications now go to the person as a Slack DM instead of
-- straight into the team channel: the people who need to act got the message
-- in a stream everyone else had to scroll past, and the channel got noisy
-- enough that it stopped being read.
--
-- The channel still needs to see the day, just not one message at a time — so
-- every DM'd event that belongs to a room is queued here and one summary per
-- room is posted daily by
-- /api/notify/digest (Vercel cron). Rows are written by the API with the
-- service role, which bypasses RLS; the policy below is only for reads from a
-- signed-in session.
--
-- Applied to production on 2026-07-31. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists slack_digest_queue (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  team        text not null,             -- 'graphic' | 'kol' | 'vdo' (rooms only)
  event       text,                      -- notify() event key
  title       text not null,
  detail      text,
  link        text,
  recipients  text[] not null default '{}',   -- display names the DM was aimed at
  delivered   boolean not null default false, -- false = nobody could be DM'd
  sent_at     timestamptz                     -- set when the digest goes out
);

-- The digest only ever asks for "not yet summarised, oldest first".
create index if not exists slack_digest_queue_pending_idx
  on slack_digest_queue (team, at) where sent_at is null;

alter table slack_digest_queue enable row level security;
drop policy if exists staff_read on slack_digest_queue;
create policy staff_read on slack_digest_queue for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff'));

-- People whose Slack account could not be found are recorded so Settings can
-- show who is silently missing their DMs, rather than failing invisibly.
-- security_p6.sql locks org_settings per key; this one is written by the API
-- with the service role, so it needs no addition to the staff allow-list.
insert into org_settings (key, label, value)
  values ('slack_user_map_v1', 'Slack user mapping', '{}')
  on conflict (key) do nothing;
insert into org_settings (key, label, value)
  values ('slack_unmapped_v1', 'Slack: people not found', '{}')
  on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY after applying:
--   select count(*) from slack_digest_queue;                    -- expect 0
--   select key from org_settings where key like 'slack_%';      -- expect 2 rows
--
-- ROLLBACK:
--   drop table if exists slack_digest_queue;
--   delete from org_settings where key in ('slack_user_map_v1','slack_unmapped_v1');
-- ═══════════════════════════════════════════════════════════════════════
