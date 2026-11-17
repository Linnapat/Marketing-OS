-- January 2027 briefs were stamped with the brief cutoff (20 Nov) as the day
-- the artwork is due. The form read the Team Calendar's "Final AW" row, which
-- the team now uses for the Final BRIEF; fixed in code by artworkSchedule.ts.
-- This moves the rows that were already saved onto the Creative round:
--   first draft  = third Friday of December = 2026-12-18
--   final file   = last  Friday of December = 2026-12-25
--
-- Touches only: graphic requests titled 0127_… due 2026-11-20 (29 on 17 Nov),
-- and brief content items publishing in 2027-01 with graphicDueDate 2026-11-20
-- (31 items in 10 briefs on 17 Nov). A first-draft date somebody already typed is kept.
-- Undo: fix_jan_artwork_due_1711_rollback.sql
begin;

create table if not exists graphic_requests_backup_jan_aw_due_1711 as
  select id, due, data from graphic_requests
  where deleted_at is null and data->>'dueIso' = '2026-11-20' and title like '0127\_%';

create table if not exists campaigns_backup_jan_aw_due_1711 as
  select id, data from campaigns c
  where exists (
    select 1 from jsonb_array_elements(coalesce(c.data->'content', '[]'::jsonb)) ci
    where ci->>'graphicDueDate' = '2026-11-20' and ci->>'publishDate' like '2027-01-%');

-- Backups hold whole briefs; keep them off the API like the earlier ones.
alter table graphic_requests_backup_jan_aw_due_1711 enable row level security;
alter table campaigns_backup_jan_aw_due_1711 enable row level security;

update graphic_requests g
set due = 'Dec 25',
    data = g.data
      || jsonb_build_object('due', 'Dec 25', 'dueIso', '2026-12-25')
      || case when coalesce(g.data->>'reviewDueIso', '') = ''
              then jsonb_build_object('reviewDueIso', '2026-12-18') else '{}'::jsonb end
where g.id in (select id from graphic_requests_backup_jan_aw_due_1711);

update campaigns c
set data = jsonb_set(c.data, '{content}', (
  select jsonb_agg(
    case when ci->>'graphicDueDate' = '2026-11-20' and ci->>'publishDate' like '2027-01-%'
      then ci
        || jsonb_build_object('graphicDueDate', '2026-12-25')
        || case when coalesce(ci->>'reviewDueDate', '') = ''
                then jsonb_build_object('reviewDueDate', '2026-12-18') else '{}'::jsonb end
      else ci end
    order by ord)
  from jsonb_array_elements(c.data->'content') with ordinality as t(ci, ord)))
where c.id in (select id from campaigns_backup_jan_aw_due_1711);

-- Ran on prod 17 Nov: 29 requests, 10 briefs (31 items).
select (select count(*) from graphic_requests_backup_jan_aw_due_1711) as requests_moved,
       (select count(*) from campaigns_backup_jan_aw_due_1711) as briefs_touched;

commit;
