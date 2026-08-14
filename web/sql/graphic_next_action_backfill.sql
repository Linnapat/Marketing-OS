-- "Next action" ต้องบอกว่าต้องทำอะไร ไม่ใช่พ่นเนื้อบรีฟ
--
-- ตอนแตกงานจากแคมเปญ (db/brief.ts) ระบบเคยเขียน nextAction เป็น
--   `KV: <kvDirection ของแคมเปญ> · Msg: <ข้อความหลัก>`
-- ซึ่งไม่ใช่ "สิ่งที่ต้องทำ" เลย และยาวตามที่ใครพิมพ์ลงช่อง KV Direction ไว้
-- (แคมเปญ TPN_2609_006 ใส่ playbook ไว้ 2,626 ตัวอักษร) ใบงานที่เปิดจากประตูอีก
-- บานหนึ่ง — กด "ขอเอง" ที่หน้า Graphic — เขียนว่า "Creative leader to assign …"
-- มาตลอด สองประตูพูดคนละเรื่องกับช่องเดียวกัน
--
-- โค้ดแก้แล้วที่ initialNextAction() ใน lib/data/graphic.ts (ประตูเดียวกันทั้งคู่)
-- ไฟล์นี้ล้างของเก่า 12 ใบที่ค้างอยู่ กติกาเดียวกับโค้ด:
--   งานเร่งรออนุมัติ → รอ Creative Leader
--   งานวิดีโอ (workKind = vdo/vdo_shoot) → เริ่มที่ storyboard
--   มีดีไซเนอร์แล้ว → เรียกชื่อคนนั้น   ไม่มี → ให้ Creative Leader จ่ายงาน
--
-- เนื้อบรีฟไม่ได้หายไปไหน: keyMessage / moodDirection ถืออยู่แล้ว และแท็บ Brief
-- พิมพ์ทั้งสองช่องอยู่แล้ว — nextAction เป็นสำเนาที่สองที่แย่กว่าเท่านั้น
--
-- ดูก่อนรัน: เปลี่ยน UPDATE เป็น SELECT ด้วย WHERE เดียวกัน

begin;

with fixed as (
  select id,
    case
      when data->>'rushStatus' = 'Pending'
        then 'รอ Creative Leader อนุมัติงานเร่งด่วน'
      when lower(coalesce(data->>'type','')) ~ 'vdo|video|reel|short'
        or coalesce(data->>'requiredVideo','false') = 'true'
        then 'Creative Content ทำ storyboard แล้วส่งให้เจ้าของงานอนุมัติ'
      when coalesce(data->>'designer','Unassigned') not in ('Unassigned','')
        then (data->>'designer') || ' to start design'
      else 'Creative leader to assign in-house or outsource designer'
    end as next_action
  from graphic_requests
  where deleted_at is null
    and data->>'nextAction' like 'KV:%'
)
update graphic_requests g
set data = jsonb_set(g.data, '{nextAction}', to_jsonb(f.next_action)),
    -- คอลัมน์แบนกับ blob ต้องตรงกัน — หน้าเว็บอ่าน blob แต่รายงานอ่านคอลัมน์
    next_action = f.next_action
from fixed f
where g.id = f.id;

commit;
