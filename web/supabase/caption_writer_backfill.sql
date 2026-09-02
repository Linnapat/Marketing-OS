-- คนเขียนแคปชั่นต้องเป็นฝั่ง Creative ไม่ใช่ Marketer ที่ขอเปิดโพสต์
--
-- ตอนแตกโพสต์จากแคมเปญ ระบบเคย stamp ช่องคนเขียน (`owner`) เป็น `ci.requester`
-- ผลคือคนเขียน / คนขอเปิดงาน / ผู้อนุมัติ เป็นชื่อเดียวกันทั้งสามช่องใน 49 โพสต์
-- กติกา "ห้ามเซ็นงานตัวเอง" จึงกันคนที่ถูกระบุออก และแถวที่ระบุชื่อผู้อนุมัติไว้
-- ก็ไม่เปิดให้คนอื่นกด ⇒ เลน Caption ขึ้น "ทั้งทีม 42" โดยที่ทั้ง 42 ไม่มีใครกดได้
--
-- โค้ดแก้ที่ต้นทางแล้ว (db/brief.ts → resolveCaptionWriter) ไฟล์นี้แก้ของเดิม
--
-- ขอบเขต: โพสต์ที่แคปชั่น**ยังไม่อนุมัติ** เท่านั้น
--   - Ready / Draft / Missing = งานที่ยังเดินอยู่ ต้องแก้ให้ครบ ไม่ใช่แค่ 49 ที่พร้อมตรวจ
--     เพราะที่เหลือจะไปติดกับดักเดิมตอนกด Mark Ready
--   - Approved = จบไปแล้ว ไม่เขียนทับประวัติว่าใครเป็นคนเขียน
--
-- เขียนชื่อ Creative Leader ที่ Active จากตาราง members ไม่ฮาร์ดโค้ด — ถ้าวันหนึ่ง
-- เปลี่ยนคน ไฟล์นี้ยังถูก
--
-- วางใน Supabase → SQL Editor → Run · รันซ้ำได้

begin;

with lead as (
  select btrim(name) as name
  from members
  where btrim(coalesce(role,'')) = 'Creative Leader'
    and lower(coalesce(status,'')) = 'active'
    and btrim(coalesce(name,'')) <> ''
  order by name
  limit 1
)
update content_posts p
   set data = p.data || jsonb_build_object('owner', (select name from lead))
  from lead
 where p.deleted_at is null
   and coalesce(p.data->>'captionStatus','') <> 'Approved'
   and btrim(coalesce(p.data->>'owner','')) is distinct from lead.name;

commit;
