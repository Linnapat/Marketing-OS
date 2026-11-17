-- Undo fix_jan_artwork_due_1711.sql: put back exactly what was there.
-- Only safe while nobody has edited these rows since — it restores the whole
-- `data` blob, so later edits to the same request/brief would be lost.
begin;

update graphic_requests g
set due = b.due, data = b.data
from graphic_requests_backup_jan_aw_due_1711 b
where g.id = b.id;

update campaigns c
set data = b.data
from campaigns_backup_jan_aw_due_1711 b
where c.id = b.id;

commit;
