-- My Tasks rows for the shoot and storyboard jobs — 2026-08-13
--
-- A Graphic Request models three jobs (storyboard → shoot → artwork) but only
-- ever produced ONE task row, always assigned to `designer`. So a Creative
-- Leader could name a shooter and a shoot date and the shooter's task list
-- stayed empty: the assignment existed on the request and nowhere the person
-- looks. On production that was 22 shoots assigned to Jeeno with no task
-- between them (11 of them hidden behind a designer task in someone else's
-- name), and every storyboard Pichayaporn owned.
--
-- The code now emits one task per job (graphicAssignmentTasks), but only when a
-- request is next saved. This gives the OUTSTANDING jobs their rows today.
--
-- Deliberately only outstanding work:
--   shoot      — a shooter is named, the job needs shooting, no footage yet
--   storyboard — an owner is named and it is not Approved
-- A finished job gets nothing. My Tasks is a to-do list, not a ledger, and
-- backfilling 23 already-approved storyboards would bury the one that is live.
--
-- No notifications fire from here (they are a browser-side fetch), which is the
-- intent: 20-odd DMs at once is not how someone wants to learn about this.
-- Tell the shooter their list has filled up.
--
-- Each row carries data->>'graphicSlot' ('shoot' / 'storyboard'), which is what
-- the app matches on together with relatedGraphicId. That is what lets it adopt
-- these rows: the next save of the request UPDATEs them in place rather than
-- inserting duplicates, and normalises any wording this file words differently.
--
-- The numeric id is only required to be UNUSED, never to identify anything.
-- <graphicId>02 is preferred because it reads well, but one of them is already
-- taken: task 246 ("kOL_AUG_LIST") holds 178515553116402, which is graphic
-- 1785155531164 slot 02. Matching on that number would have handed Pupay's KOL
-- task to Jeeno as a shoot, so a taken number simply falls back to the row's
-- own identity column.
--
-- Undo: graphic_pipeline_tasks_backfill_rollback.sql
-- Re-runnable: guarded by a not-exists on (relatedGraphicId, graphicSlot).

begin;

with cfg as (
  -- The brand's display name as the app writes it, read from the same setting
  -- the app reads rather than hardcoded here (it is editable in Settings).
  select coalesce((
    select jsonb_object_agg(b->>'key', b->>'name')
    from org_settings o, jsonb_array_elements(o.value::jsonb) b
    where o.key = 'brands_config'
  ), '{}'::jsonb) as names
),
g as (
  select
    gr.data->>'id'                                            as gid,
    gr.brand                                                  as brand_id,
    coalesce(cfg.names->>gr.brand, initcap(gr.brand))         as brand_label,
    coalesce(gr.data->>'title', 'ใบงาน')                       as title,
    gr.data->>'campaign'                                      as campaign,
    gr.campaign_id                                            as campaign_id,
    coalesce(nullif(btrim(gr.data->>'designer'), ''), 'Unassigned') as designer,
    btrim(coalesce(gr.data->>'shooter', ''))                  as shooter,
    btrim(coalesce(gr.data->>'storyboardOwner', ''))          as sb_owner,
    coalesce(gr.data->>'storyboardStatus', '')                as sb_status,
    btrim(coalesce(gr.data->>'requester', ''))                as requester,
    coalesce(nullif(gr.data->>'priority', ''), 'Med')         as priority,
    coalesce(nullif(gr.data->>'due', ''), 'TBD')              as due_label,
    nullif(gr.data->>'dueIso', '')                            as due_iso,
    case when gr.data->>'shootDate' ~ '^\d{4}-\d{2}-\d{2}$'
         then gr.data->>'shootDate' end                       as shoot_date,
    coalesce((gr.data->>'requiresShooting')::boolean, false)  as requires_shooting,
    btrim(coalesce(gr.data->>'footageLink', ''))              as footage
  from graphic_requests gr, cfg
  where gr.deleted_at is null
),
shoot as (
  select
    (gid || '02')::bigint as wanted_id,
    'shoot'               as slot,
    'ถ่ายงาน: ' || title  as task_title,
    shooter               as assignee,
    'Shoot'               as task_type,
    '📸'                  as icon,
    'doFirst'             as grp,
    coalesce(to_char(shoot_date::date, 'FMMon FMDD'), due_label) as due,
    coalesce(shoot_date, due_iso)                               as due_iso,
    case when designer <> 'Unassigned' then designer else nullif(requester, '') end as pending_approver,
    case
      when shoot_date is null
        then 'ยังไม่ได้นัดวันถ่าย — คุยกับ ' || coalesce(nullif(requester, ''), 'ผู้ขอ')
      -- Shooter and designer are often the same person here; "send the file to
      -- yourself" reads as a mistake.
      when shooter = designer
        then 'ถ่าย ' || to_char(shoot_date::date, 'FMMon FMDD') || ' แล้วขึ้นงานต่อได้เลย'
      else 'ถ่าย ' || to_char(shoot_date::date, 'FMMon FMDD') || ' แล้วส่งไฟล์ให้ '
           || case when designer <> 'Unassigned' then designer else 'ดีไซเนอร์' end
    end as next_action,
    jsonb_build_array('ดู storyboard / บรีฟก่อนวันถ่าย', 'ถ่ายตามคิว', 'ส่งไฟล์ให้ดีไซเนอร์') as checklist,
    gid, brand_id, brand_label, campaign, campaign_id, priority
  from g
  where shooter <> '' and requires_shooting and footage = ''
),
storyboard as (
  select
    (gid || '03')::bigint      as wanted_id,
    'storyboard'               as slot,
    'Storyboard: ' || title    as task_title,
    sb_owner                   as assignee,
    'Storyboard'               as task_type,
    '🎬'                       as icon,
    -- Submitted means the ball is with the approver, not the owner.
    case when sb_status = 'Submitted' then 'waitingMe' else 'doFirst' end as grp,
    coalesce(to_char(shoot_date::date, 'FMMon FMDD'), due_label) as due,
    coalesce(shoot_date, due_iso)                               as due_iso,
    nullif(requester, '')      as pending_approver,
    case sb_status
      when 'Revision'  then 'แก้ storyboard ตามที่ ' || coalesce(nullif(requester, ''), 'ผู้ขอ') || ' ตีกลับ'
      when 'Submitted' then 'รอ ' || coalesce(nullif(requester, ''), 'ผู้ขอ') || ' อนุมัติ storyboard'
      else 'ร่าง storyboard แล้วส่งให้ ' || coalesce(nullif(requester, ''), 'ผู้ขอ') || ' อนุมัติ'
    end as next_action,
    jsonb_build_array('อ่านบรีฟ', 'ร่าง storyboard', 'ส่งให้ผู้ขออนุมัติ') as checklist,
    gid, brand_id, brand_label, campaign, campaign_id, priority
  from g
  -- Storyboards belong to video work. Every outstanding one on this database is
  -- a Reel, so no kind test is needed here; the app's needsStoryboard() is the
  -- authority from the next save onwards.
  where sb_owner <> '' and sb_status <> 'Approved'
),
todo as (
  select * from shoot
  union all
  select * from storyboard
),
-- Only jobs that have no row yet, matched the way the app matches: the request
-- plus which of its jobs this is.
fresh as (
  select t.* from todo t
  where not exists (
    select 1 from tasks x
    where x.data->>'relatedGraphicId' = t.gid
      and x.data->>'graphicSlot' = t.slot
  )
)
insert into tasks (title, brand, campaign, campaign_id, assignee, type, priority, status, due,
                   next_action, blocker, checklist, done, data)
select
  t.task_title, t.brand_id, t.campaign, t.campaign_id, t.assignee, t.task_type, t.priority, 'Todo', t.due,
  t.next_action, null, t.checklist, false,
  jsonb_build_object(
    -- The readable number when it is free, the row's own identity when it is
    -- not. Only uniqueness matters; graphicSlot below is the identity.
    'id',               case when exists (select 1 from tasks x where x.data->>'id' = t.wanted_id::text)
                             then nextval(pg_get_serial_sequence('tasks', 'id'))
                             else t.wanted_id end,
    'graphicSlot',      t.slot,
    'title',            t.task_title,
    'module',           'Graphic',
    'moduleIcon',       t.icon,
    'moduleColor',      '#C2691E',
    'type',             t.task_type,
    'assignee',         t.assignee,
    'brand',            t.brand_label,
    'campaign',         t.campaign,
    'priority',         t.priority,
    'status',           'Todo',
    'group',            t.grp,
    'due',              t.due,
    'dueIso',           coalesce(t.due_iso, ''),
    'blocker',          null,
    'pendingApprover',  t.pending_approver,
    'isQuickWin',       false,
    'nextAction',       t.next_action,
    'checklist',        t.checklist,
    'relatedGraphicId', t.gid
  )
from fresh t;

select record_migration(
  'graphic_pipeline_tasks_backfill.sql',
  'สร้าง My Tasks ให้คนถ่าย + คนทำ storyboard ที่ค้างอยู่'
);

commit;
