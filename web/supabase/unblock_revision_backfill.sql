-- ปลดล็อกชิ้นงานที่ "มีใบสั่งแก้แล้ว แต่ค้างเพราะอีกด้านยังไม่ตรวจ"
--
-- กติกาเดิมให้ deliverable ค้างที่ "Waiting review" จนกว่าจะตรวจครบสองด้าน
-- ช่องส่งงานแก้จึงไม่ขึ้น ดีไซเนอร์/VDO Editor ทำอะไรกับใบสั่งแก้ที่ถืออยู่ไม่ได้
-- และ revision task ก็ไม่เคยถูกสร้าง เพราะ giveLensVerdict สร้าง task ต่อเมื่อ
-- ชิ้นงานเปลี่ยนเป็น Revision เท่านั้น
--
-- โค้ดเปลี่ยนเป็น "สั่งแก้ด้านเดียวก็พอ" แล้ว (statusFromReview) ไฟล์นี้ทำให้แถวที่
-- ค้างอยู่ก่อน deploy ได้ผลแบบเดียวกัน
--
--   ขั้น 1  สร้าง revision task ย้อนหลังให้คนที่ต้องแก้
--   ขั้น 2  เปลี่ยน status เป็น 'Revision' + ลบ key `review` + คำนวณ stage ใหม่
--
-- ลำดับสำคัญ: ขั้น 1 อ่านชื่อคนตรวจกับเหตุผลจาก `review` ซึ่งขั้น 2 จะลบทิ้ง
-- ทั้งสองขั้นจึงอยู่ใน transaction เดียวกันและห้ามสลับลำดับ
--
-- วางใน Supabase → SQL Editor → Run · รันซ้ำได้ (รอบสองจะไม่เจอแถวที่เข้าเงื่อนไข)

begin;

-- ── แถวที่เข้าเงื่อนไข: ส่งงานแล้ว รอรีวิว และมีด้านใดด้านหนึ่งสั่งแก้ ─────────
create temporary table _stuck on commit drop as
select
  g.id                          as row_id,
  g.data->>'id'                 as gid,
  g.data->>'code'               as code,
  g.title                       as title,
  g.brand                       as brand_id,
  g.campaign                    as campaign,
  d->>'platform'                as platform,
  -- ใครต้องแก้: คนที่ส่งงานชิ้นนั้นมาก่อน แล้วค่อยคนที่รับงาน แล้วค่อยคนที่ถูก
  -- assign ไว้ — ลำดับเดียวกับ revisionAssignee() ใน src/lib/data/graphic.ts
  -- "Unassigned" ไม่ใช่ชื่อคน จึงไม่นับ
  coalesce(
    nullif(nullif(btrim(d->>'submittedBy'), ''), 'Unassigned'),
    nullif(nullif(btrim(g.data->>'acceptedBy'), ''), 'Unassigned'),
    nullif(nullif(btrim(g.data->>'designer'), ''), 'Unassigned')
  )                             as assignee,
  -- ป้ายชนิดงานในชื่อ task — ลำดับเดียวกับ workKind() + REVISION_LABEL
  case
    when (g.data->>'type') ~* 'photo shoot|photo shooting'   then 'งานถ่ายภาพ'
    when (g.data->>'type') ~* 'vdo shooting|video shoot'     then 'งานถ่าย VDO'
    when (g.data->>'requiredVideo')::boolean is true
      or (g.data->>'type') ~* 'vdo|video|reel|short'         then 'งาน VDO'
    else 'งานกราฟฟิก'
  end                           as kind_label,
  -- เหตุผล + คนสั่งแก้ อ่านจาก review ตรง ๆ (ป้ายด้านเหมือนที่ giveLensVerdict เขียน)
  concat_ws(' · ',
    case when d->'review'->'info'->>'verdict' = 'revise'
         then '[ข้อมูล] ' || coalesce(d->'review'->'info'->>'note', '—') end,
    case when d->'review'->'ci'->>'verdict' = 'revise'
         then '[CI] ' || coalesce(d->'review'->'ci'->>'note', '—') end
  )                             as said,
  coalesce(
    case when d->'review'->'ci'->>'verdict'   = 'revise' then d->'review'->'ci'->>'by'   end,
    case when d->'review'->'info'->>'verdict' = 'revise' then d->'review'->'info'->>'by' end
  )                             as reviewer,
  row_number() over (partition by g.id order by ord) as rn
from graphic_requests g,
     lateral jsonb_array_elements(g.data->'deliverables') with ordinality as t(d, ord)
where g.deleted_at is null
  and jsonb_typeof(g.data->'deliverables') = 'array'
  and d->>'status' = 'Waiting review'
  and (d->'review'->'info'->>'verdict' = 'revise' or d->'review'->'ci'->>'verdict' = 'revise');

-- ── ขั้น 1 · revision task ย้อนหลัง ────────────────────────────────────────
--
-- ใบละหนึ่ง task (rn = 1) ไม่ใช่ชิ้นละหนึ่ง: ไฟล์เดียวลงหลาย platform คืองาน
-- ชิ้นเดียว และการยิงสาม task ที่เขียนเหมือนกันเป๊ะเข้า My Tasks คนเดียวไม่ได้
-- ช่วยให้ใครรู้อะไรเพิ่ม
--
-- ข้ามใบที่ "มี task แก้ที่ยังไม่ปิดอยู่แล้ว" — สี่ใบมี task จากช่องแสดงความเห็น
-- (addGraphicFeedback) ค้างอยู่ ไม่ต้องซ้ำอีกใบ
insert into tasks (title, brand, campaign, campaign_id, assignee, type, priority, status,
                   due, next_action, blocker, checklist, done, data)
select
  t.task_title, s.brand_id, s.campaign, null, s.assignee, 'Graphic', 'High', 'Todo',
  t.due_label,
  'แก้ตาม feedback จาก ' || coalesce(s.reviewer, 'ผู้ตรวจ') || ': ' || s.said,
  null,
  '["อ่าน feedback", "แก้ไขงาน", "ส่งกลับให้ตรวจอีกครั้ง"]'::jsonb,
  false,
  jsonb_build_object(
    'id', t.task_id,
    'title', t.task_title,
    'module', 'Graphic', 'moduleIcon', '🎨', 'moduleColor', '#C2691E', 'type', 'Graphic',
    'assignee', s.assignee,
    'brand', coalesce(b.name, s.brand_id),
    'campaign', s.campaign,
    'status', 'Todo', 'priority', 'High', 'group', 'doFirst',
    'due', t.due_label,
    'dueIso', to_char(t.due_date, 'YYYY-MM-DD'),
    'blocker', null, 'pendingApprover', null, 'isQuickWin', false,
    'nextAction', 'แก้ตาม feedback จาก ' || coalesce(s.reviewer, 'ผู้ตรวจ') || ': ' || s.said,
    'checklist', '["อ่าน feedback", "แก้ไขงาน", "ส่งกลับให้ตรวจอีกครั้ง"]'::jsonb,
    'relatedGraphicId', s.gid
  )
from _stuck s
left join brands b on b.id = s.brand_id
cross join lateral (
  select
    'แก้' || s.kind_label || ' — ' || s.title || ' (' || s.platform || ')' as task_title,
    (current_date + 2)                                                     as due_date,
    to_char(current_date + 2, 'FMDD Mon')                                  as due_label,
    (extract(epoch from now()) * 1000)::bigint + s.row_id                  as task_id
) t
where s.rn = 1
  and s.assignee is not null
  and not exists (
    select 1 from tasks x
    where x.deleted_at is null
      and coalesce(x.done, false) = false
      and x.data->>'relatedGraphicId' = s.gid
      and x.title like 'แก้%'
  );

-- ── ขั้น 2 · ปลดสถานะให้ช่องส่งงานเปิด ────────────────────────────────────
--
-- เหตุผลการตีกลับอยู่ใน deliverable.feedback อยู่แล้ว (applyLensVerdict เขียนไว้
-- ตั้งแต่ตอนกดตีกลับ) จึงไม่แตะ feedback และไม่ย้อนเติม history event ที่ไม่เคย
-- เกิดขึ้นจริง
with fixed as (
  select
    g.id,
    jsonb_agg(
      case
        when d->>'status' = 'Waiting review'
         and (d->'review'->'info'->>'verdict' = 'revise' or d->'review'->'ci'->>'verdict' = 'revise')
        -- ลบ `review` ทิ้งด้วย: รอบใหม่ต้องเริ่มนับใหม่ ไม่งั้นผลตรวจของเวอร์ชันเก่า
        -- จะเด้งงานกลับทันทีที่อีกด้านตอบ ทั้งที่ไม่มีใครเปิดไฟล์ใหม่ดู
        then (d - 'review') || jsonb_build_object('status', 'Revision')
        else d
      end
      order by ord
    ) as dels
  from graphic_requests g,
       lateral jsonb_array_elements(g.data->'deliverables') with ordinality as t(d, ord)
  where g.id in (select row_id from _stuck)
  group by g.id
),
staged as (
  select f.id, f.dels,
    -- ลำดับเดียวกับ stageFromDeliverables() ใน src/lib/data/graphic.ts
    case
      when not exists (select 1 from jsonb_array_elements(f.dels) y where y->>'status' <> 'Approved') then 'Approved'
      when exists (select 1 from jsonb_array_elements(f.dels) y where y->>'status' = 'Revision') then 'Revision Requested'
      when exists (select 1 from jsonb_array_elements(f.dels) y where y->>'status' = 'Waiting review') then 'Waiting Feedback'
      else 'New Request'
    end as stage
  from fixed f
)
update graphic_requests g
   set data  = g.data || jsonb_build_object('deliverables', s.dels, 'stage', s.stage),
       stage = s.stage
  from staged s
 where g.id = s.id;

commit;
