-- Job numbers for content posts and artwork requests — 2026-07-31
--
-- The campaign got a readable number (TPN_2609_003); the work under it did not.
-- Content had `ci-1`, which restarts inside every campaign — six `ci-N` values
-- were in use across more than one campaign, so the number named nothing on its
-- own — and artwork had only its table row id. The team filled the gap the way
-- it did for campaigns: by typing a number into the title ("0901_", "MS0901"),
-- 18 of 51 posts and 17 of 47 requests deep.
--
--   TPN_2609_003          the campaign
--   TPN_2609_003-C01      a post in it
--   TPN_2609_003-C01-A01  the artwork for that post
--   TPN_2609_003-A01      artwork with no post behind it
--
-- Titles are deliberately NOT rewritten here, unlike the campaign cleanup: the
-- leading "0901" in a post title is its publish date, not a sequence number, so
-- stripping it would delete information rather than move it.
--
-- Undo: work_codes_backfill_rollback.sql
-- Re-runnable: every statement recomputes the same code from the same ordering.

begin;

-- Posts number in publish order, so the sequence reads the way the plan does.
-- The row id breaks ties (three posts share a date on MNC_2609_001).
with pc as (
  select p.id,
         c.data->>'code' || '-C' || lpad(row_number() over (
           partition by p.campaign_id
           order by coalesce(p.data->>'dateIso', p.data->>'publishDate'), p.id)::text, 2, '0') as code
    from content_posts p
    join campaigns c on c.id = p.campaign_id)
update content_posts p set data = p.data || jsonb_build_object('code', pc.code)
  from pc where p.id = pc.id;

-- Artwork hangs off the post it serves, by the post's blob id (`contentPostId`),
-- which is the link the app itself uses.
with ga as (
  select g.id,
         p.data->>'code' || '-A' || lpad(row_number() over (
           partition by p.id order by g.id)::text, 2, '0') as code
    from graphic_requests g
    join content_posts p on p.data->>'id' = g.data->>'contentPostId'
   where coalesce(g.data->>'contentPostId', '') <> '')
update graphic_requests g set data = g.data || jsonb_build_object('code', ga.code)
  from ga where g.id = ga.id;

-- POSM, posters and menu artwork never become a post. They number under the
-- campaign instead — a separate sequence from the per-post one above, which is
-- why "-A01" can exist twice under one campaign without colliding: one is
-- CAMPAIGN-A01, the other CAMPAIGN-Cnn-A01.
with gs as (
  select g.id,
         c.data->>'code' || '-A' || lpad(row_number() over (
           partition by g.campaign_id order by g.id)::text, 2, '0') as code
    from graphic_requests g
    join campaigns c on c.id = g.campaign_id
   where coalesce(g.data->>'contentPostId', '') = '')
update graphic_requests g set data = g.data || jsonb_build_object('code', gs.code)
  from gs where g.id = gs.id;

commit;

-- Expected after: 51 posts and 47 requests, every one coded, all codes distinct,
-- none malformed, and every attached artwork's code prefixed by its post's.
