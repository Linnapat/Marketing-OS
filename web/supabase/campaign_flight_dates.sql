-- A campaign's flight becomes two real dates — 2026-08-13
--
-- `campaigns.dates` is a label written for people ("Oct 1 – Jan 31") that the
-- app then reads back as data. On 13 Aug that cost us three campaigns: with no
-- year in the text, both ends parsed as the current year, so a flight crossing
-- New Year ended before it started, matched no month, and read as deleted.
-- Brand Awareness had been invisible since the day it was created, ten days.
--
-- The parser now copes and the label carries years, but the real fix is to stop
-- asking a display string to be the source of truth. The dates already exist in
-- the brief blob (data->>'startDate' / 'endDate'); this lifts them into columns
-- the database can type-check, compare and constrain.
--
-- `dates` stays: it is what the sheet mirror, the store printout and the detail
-- header show, and rewriting every reader at once is how you turn one bug into
-- five. It becomes a rendering of these columns rather than the record itself.
--
-- The check constraint is the part that matters most. A backwards flight is now
-- impossible to store, so this class of bug cannot come back through a new code
-- path — no test, review or memo required.
--
-- Undo: campaign_flight_dates_rollback.sql
-- Re-runnable: add column if not exists + an idempotent backfill.

begin;

alter table campaigns
  add column if not exists start_date date,
  add column if not exists end_date   date;

-- The brief blob is authoritative: it is what the form wrote and what fmtRange
-- rendered the label from. Rows whose blob has no usable pair keep NULL and the
-- app falls back to parsing the label, so nothing regresses on old data.
update campaigns
set start_date = (data->>'startDate')::date,
    end_date   = (data->>'endDate')::date
where data->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
  and data->>'endDate'   ~ '^\d{4}-\d{2}-\d{2}$'
  and (start_date is distinct from (data->>'startDate')::date
    or end_date   is distinct from (data->>'endDate')::date);

-- Both-or-neither: half a flight is a range nothing can filter on, and the
-- fallback to the label only works if it is unambiguous which source is in use.
alter table campaigns drop constraint if exists campaigns_flight_both_ends;
alter table campaigns add constraint campaigns_flight_both_ends
  check ((start_date is null) = (end_date is null));

-- The one that closes the bug for good.
alter table campaigns drop constraint if exists campaigns_flight_ordered;
alter table campaigns add constraint campaigns_flight_ordered
  check (start_date is null or end_date is null or end_date >= start_date);

select record_migration(
  'campaign_flight_dates.sql',
  'campaigns.start_date/end_date เป็นคอลัมน์วันที่จริง + กันช่วงเวลากลับหัว'
);

commit;
