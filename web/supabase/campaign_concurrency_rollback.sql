-- Rollback of campaign_concurrency.sql
drop trigger if exists campaigns_touch_updated_at on campaigns;
drop function if exists touch_updated_at();
alter table campaigns drop column if exists updated_at;
delete from schema_migrations where filename = 'campaign_concurrency.sql';
