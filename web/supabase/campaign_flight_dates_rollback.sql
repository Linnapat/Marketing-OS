-- Undo campaign_flight_dates.sql.
--
-- Clean to reverse: the migration only ADDED two columns and two constraints.
-- `dates` was never rewritten and the brief blob was never touched, so dropping
-- the columns restores the prior state exactly — the app falls back to parsing
-- the label, which is what it did before.

begin;

alter table campaigns drop constraint if exists campaigns_flight_ordered;
alter table campaigns drop constraint if exists campaigns_flight_both_ends;
alter table campaigns drop column if exists start_date;
alter table campaigns drop column if exists end_date;

delete from schema_migrations where filename = 'campaign_flight_dates.sql';

commit;
