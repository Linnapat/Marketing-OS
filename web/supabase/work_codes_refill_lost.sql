-- คืนเลขงาน (code) ให้ใบงาน Graphic/VDO ที่เลขหายไป (5 ต.ค. 69)
--
-- ใบงานได้เลขตอนสร้างแล้ว แต่หน้า /graphic เก็บสำเนาก่อนได้เลขไว้ใน state
-- พอกดบันทึกอะไรต่อจากหน้าเดิม (รับงาน/ส่ง storyboard/เปลี่ยนสถานะ) ทั้งก้อน data
-- ถูกเขียนทับ เลขเลยหาย — โค้ดแก้แล้ว (createGraphic คืนสำเนาที่มีเลข + updateGraphic
-- ไม่ลบเลขเดิม) ไฟล์นี้คืนเลขให้ของเก่า
--
-- แตะเฉพาะแถวที่ไม่มี code · ออกเลขต่อจากเลขสูงสุดที่ใช้แล้วใต้ parent เดียวกัน
-- (ไม่ชนกับเลขที่มีอยู่) · parent = โพสต์ในแคมเปญเดียวกัน ไม่งั้นใต้แคมเปญ
-- วางใน Supabase → SQL Editor → Run · รันซ้ำได้

begin;

with missing as (
  select g.id,
         coalesce(p.data->>'code', c.data->>'code') as parent
    from graphic_requests g
    join campaigns c on c.id = g.campaign_id
    left join content_posts p
      on p.data->>'id' = g.data->>'contentPostId' and p.campaign_id = g.campaign_id
   where g.deleted_at is null
     and coalesce(g.data->>'code','') = ''
     and coalesce(p.data->>'code', c.data->>'code','') <> ''
), used as (
  select m.parent, coalesce(max(substring(x.data->>'code' from '-A(\d+)$')::int)
           filter (where left(x.data->>'code', length(m.parent) + 2) = m.parent || '-A'
                          and substring(x.data->>'code' from length(m.parent) + 3) ~ '^\d+$'), 0) as top
    from (select distinct parent from missing) m
    cross join graphic_requests x
   group by m.parent
), fill as (
  select m.id, m.parent || '-A' || lpad((u.top + row_number() over (partition by m.parent order by m.id))::text, 2, '0') as code
    from missing m join used u using (parent)
)
update graphic_requests g set data = g.data || jsonb_build_object('code', fill.code)
  from fill where g.id = fill.id;

commit;
