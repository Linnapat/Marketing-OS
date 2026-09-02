-- งานวิดีโอที่ CI ผ่านแล้ว แต่ค้างเพราะรอด้าน "ข้อมูล" ที่เลิกใช้แล้ว
--
-- กติกาใหม่ (lensesFor) ให้งานวิดีโอเซ็นครั้งเดียวโดย Creative Leader / CMO
-- ไฟล์นี้ทำให้แถวที่ค้างอยู่ก่อน deploy ได้ผลแบบเดียวกัน — 20 ชิ้นใน 7 ใบงาน
-- ที่ Pichayaporn กดผ่าน CI ไปแล้วแต่สถานะยังเป็น "Waiting review"
--
--   ขั้น 1  ยิง history event `approved` ย้อนหลัง  ← เรื่องเงิน อ่านคำเตือนข้างล่าง
--   ขั้น 2  เปลี่ยน status เป็น 'Approved' + คำนวณ stage ใหม่
--
-- ⚠️ ทำไมต้องเติม history: รายงาน Artwork Count ออกใบวางบิล studio จาก event
--    `approved` (artworkReport.ts → eventsByKey) ไม่ใช่จาก status · ถ้าเปลี่ยนแค่
--    status ทั้ง 20 ชิ้นจะหายไปจากบิล · เวลาและชื่อที่ใช้ไม่ได้กุขึ้น — เอาจาก
--    ผลตรวจ CI จริง (review.ci.at / review.ci.by) ซึ่งคือนาทีที่งานถูกอนุมัติจริง
--    ภายใต้กติกาใหม่
--
-- ไม่แตะ `review` — ลายเซ็น CI คือหลักฐานว่าใครอนุมัติ ต้องเก็บไว้
--
-- ⚠️ สิ่งที่ไฟล์นี้ทำแทนแอปไม่ได้ (ต้องไล่เองถ้าจำเป็น):
--    - แนบ asset ที่อนุมัติกลับเข้าโพสต์ใน Content Plan (syncApprovedAssetsToContent)
--    - เก็บไฟล์เข้าโมดูล Assets (fileApprovedAsset)
--    ทั้งสองอย่างเป็น side effect ฝั่งแอปตอนกดปุ่ม ไม่ได้อยู่ในตารางนี้
--
-- วางใน Supabase → SQL Editor → Run · รันซ้ำได้ (รอบสองจะไม่เจอแถวที่เข้าเงื่อนไข)

begin;

create temporary table _vdo_ok on commit drop as
select
  g.id as row_id,
  (d->>'platform') || '::' || (d->>'size') as deliverable_key,
  d->'review'->'ci'->>'at' as ci_at,
  d->'review'->'ci'->>'by' as ci_by
from graphic_requests g,
     lateral jsonb_array_elements(g.data->'deliverables') d
where g.deleted_at is null
  and jsonb_typeof(g.data->'deliverables') = 'array'
  -- เฉพาะงานวิดีโอ — เงื่อนไขเดียวกับ workKind()
  and ((g.data->>'requiredVideo')::boolean is true or (g.data->>'type') ~* 'vdo|video|reel|short')
  and d->>'status' = 'Waiting review'
  and d->'review'->'ci'->>'verdict' = 'pass';

-- ── ขั้น 1 · history event approved (ฐานของการวางบิล) ─────────────────────
-- กันซ้ำ: ถ้าแถวนั้นมี event approved อยู่แล้วจะไม่เติมอีก
update graphic_requests g
   set data = jsonb_set(g.data, '{history}',
     coalesce(g.data->'history', '[]'::jsonb) || (
       select coalesce(jsonb_agg(jsonb_build_object(
                'type', 'approved', 'at', v.ci_at, 'by', v.ci_by,
                'deliverableKey', v.deliverable_key)), '[]'::jsonb)
       from _vdo_ok v
       where v.row_id = g.id
         and not exists (
           select 1 from jsonb_array_elements(coalesce(g.data->'history','[]'::jsonb)) h
           where h->>'type' = 'approved' and h->>'deliverableKey' = v.deliverable_key)
     ))
 where g.id in (select row_id from _vdo_ok);

-- ── ขั้น 2 · ปลดสถานะ + คำนวณ stage ใหม่ ──────────────────────────────────
with fixed as (
  select g.id, jsonb_agg(
    case
      when d->>'status' = 'Waiting review' and d->'review'->'ci'->>'verdict' = 'pass'
      then d || jsonb_build_object('status', 'Approved')
      else d
    end order by ord) as dels
  from graphic_requests g,
       lateral jsonb_array_elements(g.data->'deliverables') with ordinality as t(d, ord)
  where g.id in (select row_id from _vdo_ok)
  group by g.id
), staged as (
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
