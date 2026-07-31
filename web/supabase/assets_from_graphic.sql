-- Approved artwork lands in the Asset Library.
--
-- The library was upload-only. A finished piece reached the Content Plan post
-- it served and nothing else, so POSM, posters and menu artwork — work that
-- never becomes a social post — finished nowhere at all.
--
-- One request = one asset (the team's call). The request id is the identity,
-- so a piece that went back for revision and was approved again overwrites its
-- row instead of leaving a near-duplicate behind.
--
-- Idempotent.

begin;

alter table public.assets add column if not exists graphic_request_id text;

-- Plain, NOT partial. A partial index cannot be named as an ON CONFLICT target
-- without repeating its predicate, and PostgREST's upsert(onConflict) has no
-- way to express one — the insert fails with "no unique or exclusion
-- constraint matching the ON CONFLICT specification", which the client
-- swallows as a warning, so nothing would ever reach the library and nothing
-- would say why.
--
-- Plain is also correct: Postgres treats NULLs as distinct, so hand-uploaded
-- assets (no request id) still never collide with each other.
drop index if exists public.assets_graphic_request_uniq;
create unique index if not exists assets_graphic_request_uniq
  on public.assets (graphic_request_id);

commit;
