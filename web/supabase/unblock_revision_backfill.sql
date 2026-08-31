-- ปลดล็อกชิ้นงานที่ "มีใบสั่งแก้แล้ว แต่ค้างเพราะอีกด้านยังไม่ตรวจ"
--
-- กติกาเดิมให้ deliverable ค้างที่ "Waiting review" จนกว่าจะตรวจครบสองด้าน
-- ช่องส่งงานแก้จึงไม่ขึ้น ดีไซเนอร์/VDO Editor ทำอะไรกับใบสั่งแก้ที่ถืออยู่ไม่ได้
-- โค้ดเปลี่ยนเป็น "สั่งแก้ด้านเดียวก็พอ" แล้ว (statusFromReview) — ไฟล์นี้ทำให้
-- แถวที่ค้างอยู่ก่อน deploy ได้ผลแบบเดียวกัน
--
-- ทำสองอย่างกับแถวที่ status = 'Waiting review' และมีด้านใดด้านหนึ่ง verdict = 'revise':
--   1. เปลี่ยน status เป็น 'Revision'  → ช่องส่งงานแก้เปิด
--   2. ลบ key `review` ทิ้ง            → รอบใหม่เริ่มนับใหม่ ผลตรวจของเวอร์ชันเก่า
--                                        ไม่ตามไปเด้งงานกลับตอนอีกด้านตอบ
-- แล้วคำนวณ stage ของใบงานใหม่ตามลำดับเดียวกับ stageFromDeliverables()
--
-- เหตุผลการตีกลับอยู่ใน deliverable.feedback อยู่แล้ว (applyLensVerdict เขียนไว้
-- ตั้งแต่ตอนกดตีกลับ) ไฟล์นี้จึงไม่แตะ feedback และไม่ย้อนไปเติม history event
-- ที่ไม่เคยเกิดขึ้นจริง
--
-- วางใน Supabase → SQL Editor → Run · รันซ้ำได้ (รอบสองจะไม่เจอแถวที่เข้าเงื่อนไข)

begin;

-- ── ดูก่อนว่าจะโดนกี่แถว ────────────────────────────────────────────────
-- (ลบ comment ออกถ้าอยากเห็นรายการก่อนกด commit)
-- select g.id, g.data->>'code' as code, g.title,
--        d->>'platform' as platform, d->'review' as review
--   from graphic_requests g, jsonb_array_elements(g.data->'deliverables') d
--  where g.deleted_at is null
--    and d->>'status' = 'Waiting review'
--    and (d->'review'->'info'->>'verdict' = 'revise' or d->'review'->'ci'->>'verdict' = 'revise');

with fixed as (
  select
    g.id,
    jsonb_agg(
      case
        when d->>'status' = 'Waiting review'
         and (d->'review'->'info'->>'verdict' = 'revise' or d->'review'->'ci'->>'verdict' = 'revise')
        then (d - 'review') || jsonb_build_object('status', 'Revision')
        else d
      end
      order by ord
    ) as dels
  from graphic_requests g,
       lateral jsonb_array_elements(g.data->'deliverables') with ordinality as t(d, ord)
  where g.deleted_at is null
    and jsonb_typeof(g.data->'deliverables') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(g.data->'deliverables') x
      where x->>'status' = 'Waiting review'
        and (x->'review'->'info'->>'verdict' = 'revise' or x->'review'->'ci'->>'verdict' = 'revise')
    )
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
