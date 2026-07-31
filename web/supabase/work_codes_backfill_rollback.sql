-- Undo work_codes_backfill.sql.
--
-- Clean to reverse: the backfill only ADDED a `code` key: no title, link, id or
-- name was touched, so dropping the key restores the prior state exactly.
-- Nothing references these codes as a foreign key.

begin;

update content_posts    set data = data - 'code' where data ? 'code';
update graphic_requests set data = data - 'code' where data ? 'code';

commit;

-- Note: new posts and requests created after the backfill are numbered by the
-- app (db/workCode.ts), so they will be re-issued codes on the next create even
-- after this runs. To stop that too, revert the app change as well.
