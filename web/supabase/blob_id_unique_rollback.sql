-- Rollback of blob_id_unique.sql — removes the only thing preventing two rows
-- from sharing the id that update/delete match on. See that file first.
drop index if exists content_posts_blob_id_uniq;
drop index if exists graphic_requests_blob_id_uniq;
drop index if exists tasks_blob_id_uniq;
drop index if exists kols_blob_id_uniq;
delete from schema_migrations where filename = 'blob_id_unique.sql';
