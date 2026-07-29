-- ── Make the id we address rows BY actually unique ───────────────────────
--
-- Every update and delete in these tables matches on `data->>'id'`:
--     update content_posts ... where data->>'id' = $1
-- but nothing stopped two rows carrying the same one. When that happened,
-- editing one post edited the other and deleting one deleted the other — and
-- Postgres reported success both times.
--
-- The existing *_source_uniq indexes look like they cover this. They do not:
-- they guard (campaign_id, sourceContentItemId), the idempotency key used to
-- make a re-Submit a no-op. Two rows can satisfy that and still collide on the
-- id they are addressed by — which is exactly what happened, with ci-1 and ci-6
-- of one campaign both minted as "c17853298244150".
--
-- Four separate id-collision bugs have been fixed in this codebase by patching
-- the code that mints ids. This is the constraint that turns the fifth from
-- silent data corruption into a failed insert.
--
-- NOT partial on deleted_at: a trashed row keeps its id reserved, so restoring
-- it can never collide with something created in the meantime.
--
-- Run AFTER checking for existing duplicates:
--   select data->>'id', count(*) from content_posts group by 1 having count(*)>1;
-- (verified clean on 2026-07-29 before applying)
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- rollback: blob_id_unique_rollback.sql

create unique index if not exists content_posts_blob_id_uniq    on content_posts    ((data->>'id'));
create unique index if not exists graphic_requests_blob_id_uniq on graphic_requests ((data->>'id'));
create unique index if not exists tasks_blob_id_uniq            on tasks            ((data->>'id'));
create unique index if not exists kols_blob_id_uniq             on kols             ((data->>'id'));

select record_migration('blob_id_unique.sql', 'unique on data->>id for the 4 blob-addressed tables');
