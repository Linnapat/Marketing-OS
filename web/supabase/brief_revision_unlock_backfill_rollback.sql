-- Undo brief_revision_unlock_backfill.sql.
--
-- Removes only the grants this backfill created, identified by the decision
-- note it stamps. A grant issued by the app (or one a Creative Leader decided
-- by hand) has a different note and is left alone.
--
-- Safe either way: briefUnlock is permission, not content. Dropping it closes
-- the brief editor again; nothing anyone typed is affected.
--
-- Note it cannot bring back a grant already SPENT — a spent grant deletes its
-- own key, so a request whose brief was fixed in the meantime simply has no key
-- to remove, and this leaves it as it is. That is the correct outcome.

begin;

update graphic_requests
set data = data - 'briefUnlock'
where deleted_at is null
  and data->'briefUnlock'->>'decisionNote' =
      'ปล่อยย้อนหลัง: Creative ส่งบรีฟกลับมาแก้ก่อนที่ระบบจะปล่อยให้อัตโนมัติ';

delete from schema_migrations where filename = 'brief_revision_unlock_backfill.sql';

commit;
