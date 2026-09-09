-- OMD · แจ้งเตือน "ใกล้ครบ 200 แต้ม" — สคริปต์รีเฟรชกลุ่มเป้าหมาย (รันซ้ำได้ทุกวัน)
--
-- ทำไมต้องเป็น 200 แต้ม: 12 เดือนล่าสุด OMD มีการแลกแต้มทั้งหมด ~840 ครั้ง
-- และ 765 ครั้ง (91%) แลกที่ 200 แต้มพอดี — 200 คือขั้นบันไดจริงของแบรนด์นี้
-- ไม่ใช่ตัวเลขที่ตั้งขึ้นเอง คนที่ค้างอยู่ 150–199 คือคน "อีกมื้อเดียวก็ถึง"
-- (OMD ได้ 1 แต้ม / 10 บาท · บิลเฉลี่ย 588 บาท ≈ 58 แต้มต่อมื้อ)
--
-- ตาราง `customers` คือข้อมูลดิบจาก Loga (มี current_points / expiry_date)
-- ตาราง `Customer` คือฝั่งส่งข้อความ (มี lineUserId / tags) — เชื่อกันด้วย line_user_id
-- CDP ยังไม่มี field แต้มให้ Segment ใช้ตรง ๆ จึงคำนวณเป็น tag ไว้ให้ Segment อ่าน
--
-- กติกาที่ตัดคนออก (สำคัญ อย่าถอด):
--   1. expiry_date < วันนี้      → แต้มหมดอายุไปแล้ว ส่งไปคือโกหกลูกค้า (86 คน)
--   2. consentStatus = REVOKED   → ลูกค้าถอน consent แล้ว (8 คน)
--   3. group_name = CONTROL      → กลุ่ม holdout ไว้วัด incremental lift ห้ามส่ง
--
-- รันทุกวันหลัง Loga sync (ประมาณ 04:10 น.) เพราะ current_points ขยับทุกคืน
--
-- ดูก่อนรัน: เปลี่ยน UPDATE เป็น SELECT ด้วย WHERE ชุดเดียวกัน

begin;

-- 1) ฐานของรอบนี้: สมาชิก OMD ที่แต้ม 150–199 และแต้มยังไม่หมดอายุ
create temporary table _omd_near200 on commit drop as
select
  c.id            as customer_id,
  c."lineUserId"  as line_user_id,
  l.current_points,
  l.last_access,
  l.expiry_date
from customers l
join "Customer" c
  on c."lineUserId" = l.line_user_id
 and c."brandId" = (select id from "Brand" where code = 'OMD')
where l.brand = 'OMD'
  and l.current_points between 150 and 199
  and l.expiry_date >= current_date
  and c."consentStatus"::text <> 'REVOKED';

-- 2) Holdout 10% แบ่งด้วย hash ของ lineUserId — คนเดิมอยู่กลุ่มเดิมเสมอทุกรอบ
--    ถ้าไม่มี control ก็วัดไม่ได้ว่ายอดที่กลับมาเกิดจากข้อความหรือเกิดขึ้นอยู่แล้ว
insert into ab_test_membership (test_name, group_name, line_user_id, assigned_at)
select
  'points_near200_OMD',
  case when ('x' || substr(md5(line_user_id), 1, 8))::bit(32)::bigint % 10 = 0
       then 'CONTROL' else 'TEST_B' end,
  line_user_id,
  now()
from _omd_near200
on conflict do nothing;

-- 3) ล้าง tag รอบก่อนทิ้งทั้งหมด (คนที่ครบ 200 แล้ว / แต้มหมดอายุ ต้องหลุดออกเอง)
update "Customer"
set tags = array_remove(array_remove(tags, 'points:OMD:near200'), 'points:OMD:near200_active90'),
    "updatedAt" = now()
where tags && array['points:OMD:near200', 'points:OMD:near200_active90'];

-- 4) ติด tag รอบใหม่
--    near200          = ทั้งแถบ ใช้ดูขนาดกลุ่ม / ทำ broadcast แยกทีหลัง
--    near200_active90 = มาภายใน 90 วัน และไม่ใช่ CONTROL → กลุ่มที่ automation ส่งจริง
update "Customer" c
set tags = array_append(c.tags, 'points:OMD:near200'),
    "updatedAt" = now()
from _omd_near200 n
where c.id = n.customer_id;

update "Customer" c
set tags = array_append(c.tags, 'points:OMD:near200_active90'),
    "updatedAt" = now()
from _omd_near200 n
where c.id = n.customer_id
  and n.last_access >= current_date - 90
  and not exists (
    select 1 from ab_test_membership a
    where a.test_name = 'points_near200_OMD'
      and a.group_name = 'CONTROL'
      and a.line_user_id = n.line_user_id
  );

-- 5) อัปเดตตัวเลขหน้า Segment ให้ตรงกับของจริง
update "Segment" s
set "memberCount" = (
      select count(*) from "Customer" c
      where c.tags @> array[(s.conditions->'conditions'->0->>'value')::text]
    ),
    "lastCountAt" = now(),
    "updatedAt"   = now()
where s.id in ('seg_omd_near200', 'seg_omd_near200_active90');

commit;
