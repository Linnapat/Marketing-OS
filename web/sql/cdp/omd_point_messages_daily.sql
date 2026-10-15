-- OMD · งานรายวันของข้อความเรื่องแต้มทุกตัว รวมเป็นฟังก์ชันเดียว
--
-- ติดตั้งจริงใน CDP ด้วย migration `omd_point_tiers_daily`
-- ฟังก์ชันที่ใช้จริงคือ public.refresh_omd_point_tiers()
-- pg_cron job `omd-near200-refresh` เวลา 04:40 UTC = 11:40 น. ไทย ทุกวัน
-- (ตั้งหลัง Loga sync ที่เขียน `customers` เสร็จช่วง 04:00–04:21 UTC)
--
-- บันไดรางวัลจริงของโปรแกรมสมาชิก OMD (artwork 15 ต.ค. 2026)
--   60 แต้ม   Comfort Set   (มูลค่า 60)
--   90 แต้ม   Ordinary Set  (มูลค่า 90)
--   200 แต้ม  Omakase Don   (มูลค่า 250 · ใช้ได้เมื่อบิลตั้งแต่ 300 บาท)
--   500 แต้ม  Izakaya Set ข้ามแบรนด์ TEPPEN (Friend only) / OMD Tumbler
--   Friend = สะสมครบ 201 แต้มใน 12 เดือนล่าสุด
--
-- บทเรียน: รอบแรกเราอ่านจากพฤติกรรมการแลก (91% แลกที่ 200) แล้วสรุปว่าบันได
-- มีขั้นเดียว จึงปิดกลุ่มแต้ม 100–199 ทิ้งด้วยเหตุผลว่าเอื้อมไม่ถึงรางวัล
-- ผิด — ขั้น 60 และ 90 มีอยู่จริง พฤติกรรมการแลกไม่ใช่รายการสิทธิ์
-- ก่อนตัดสินใจเรื่องสิทธิ์ ให้ดูเอกสารโปรแกรมสมาชิกเสมอ ไม่ใช่เดาจากข้อมูลธุรกรรม
--
-- ทำไมต้องรวมเป็นฟังก์ชันเดียว
-- ลูกค้าคนเดียวเข้าเกณฑ์ได้หลายข้อความพร้อมกัน (แต้ม 150–199 ที่กำลังหมดอายุ
-- เข้าได้ทั้ง exp30_ordinary และ near200) ถ้าแยกฟังก์ชันกันคำนวณ ต่างตัวต่างติด tag
-- แล้วลูกค้าได้หลายข้อความเรื่องแต้มในวันเดียว ฟังก์ชันเดียวที่ไล่ตามลำดับ
-- ความสำคัญกันปัญหานี้ที่ต้นทาง ไม่ใช่ไปแก้ทีหลัง
--
-- ลำดับความสำคัญ — คนหนึ่งได้ tag ที่ส่งจริงใบเดียว
--   1. exp30_redeemable  >= 200 + หมดอายุ 30 วัน  → Omakase Don   (ACTIVE)
--   2. exp30_ordinary    90–199 + หมดอายุ 30 วัน  → Ordinary Set  (DRAFT)
--   3. exp30_comfort     60–89 + หมดอายุ 30 วัน   → Comfort Set   (DRAFT)
--   4. near200           150–199 มาใน 90 วัน      → ข้อความเดิม    (ACTIVE)
-- ข้อความที่มีเส้นตายชนะข้อความสะสมเสมอ เพราะแต้มหายแล้วหายเลย
--
-- ขั้น 2 และ 3 ยังเป็น DRAFT: การกันคิวจึงอ่านสถานะ automation จริงตอนรัน
-- ถ้ายังไม่ ACTIVE จะไม่กันคนออกจาก near200 (ไม่งั้นมีคนเงียบหายทั้งที่ไม่ได้ตั้งใจ)
-- พอเปลี่ยนเป็น ACTIVE ลำดับความสำคัญมีผลเองทันที ไม่ต้องแก้โค้ดซ้ำ
--
-- ล็อกแบรนด์ OMD เหมือนเดิม และตรวจการรั่วข้ามแบรนด์ก่อนจบทุกรอบ
--
-- หมายเหตุ: ฟังก์ชันเก่า refresh_omd_near200() และ refresh_omd_point_messages()
-- ยังค้างอยู่ในฐานข้อมูล ลบไม่สำเร็จเพราะ DROP FUNCTION ค้างผ่าน MCP (ไม่ใช่ล็อก
-- ในฐานข้อมูล ตรวจ pg_stat_activity แล้วว่าง) cron ชี้มาที่ตัวใหม่แล้ว
-- ตัวเก่าไม่มีใครเรียก ให้ลบทิ้งเมื่อเข้าถึง DB ได้โดยตรง

create extension if not exists pg_cron;

create or replace function public.refresh_omd_point_tiers(p_daily_cap int default 250)
returns table (exp30_redeemable int, exp30_ordinary int, exp30_comfort int,
               near200_queue int, band_150_199 int)
language plpgsql
as $fn$
declare
  v_brand text; v_leak int; v_ord_active boolean; v_comf_active boolean;
begin
  select id into v_brand from "Brand" where code = 'OMD';
  if v_brand is null then
    raise exception 'ไม่พบแบรนด์ OMD ใน Brand — หยุดก่อน ไม่เดาแบรนด์';
  end if;

  -- ขั้น 2 และ 3 ยังเป็น DRAFT — อ่านสถานะจริงเพื่อไม่ให้กันคิว near200 ก่อนเวลา
  select coalesce(status::text='ACTIVE',false) into v_ord_active
  from "Automation" where id='auto_points_expiring_ordinary_omd';
  select coalesce(status::text='ACTIVE',false) into v_comf_active
  from "Automation" where id='auto_points_expiring_comfort_omd';

  -- ฐานร่วม: สมาชิก OMD ที่ยัง consent · มีแต้มเหลือ · แต้มยังไม่หมดอายุ
  create temporary table _base on commit drop as
  select c.id as customer_id, c."lineUserId" as line_user_id,
         l.current_points, l.last_access, l.expiry_date
  from customers l
  join "Customer" c on c."lineUserId"=l.line_user_id and c."brandId"=v_brand
  where l.brand='OMD' and l.current_points > 0 and l.expiry_date >= current_date
    and c."consentStatus"::text <> 'REVOKED';

  -- holdout เทสแต้มใกล้หมดอายุ 15% · salt ต่างจากเทส near200
  insert into ab_test_membership (test_name, group_name, line_user_id, assigned_at)
  select 'points_expiring_OMD',
         case when ('x'||substr(md5('exp:'||line_user_id),1,8))::bit(32)::bigint % 100 < 15
              then 'CONTROL' else 'TEST_B' end, line_user_id, now()
  from _base where current_points >= 60 and expiry_date <= current_date + 30
  on conflict do nothing;

  insert into ab_test_membership (test_name, group_name, line_user_id, assigned_at)
  select 'points_near200_OMD',
         case when ('x'||substr(md5(line_user_id),1,8))::bit(32)::bigint % 10 = 0
              then 'CONTROL' else 'TEST_B' end, line_user_id, now()
  from _base where current_points between 150 and 199
  on conflict do nothing;

  -- ล้าง tag ทุกใบของรอบก่อน เฉพาะแถวแบรนด์ OMD
  update "Customer"
  set tags = array_remove(array_remove(array_remove(array_remove(array_remove(array_remove(
               tags,'points:OMD:near200'),'points:OMD:near200_active90'),
               'points:OMD:exp30_redeemable'),'points:OMD:exp30_near'),
               'points:OMD:exp30_ordinary'),'points:OMD:exp30_comfort'),
      "updatedAt" = now()
  where "brandId"=v_brand
    and tags && array['points:OMD:near200','points:OMD:near200_active90',
                      'points:OMD:exp30_redeemable','points:OMD:exp30_near',
                      'points:OMD:exp30_ordinary','points:OMD:exp30_comfort'];

  -- 1) >= 200 แต้ม · หมดอายุ 30 วัน → Omakase Don (เรียงคนที่หมดอายุเร็วสุดก่อน)
  create temporary table _p1 on commit drop as
  select b.customer_id from _base b
  where b.current_points >= 200 and b.expiry_date <= current_date + 30
    and not exists (select 1 from ab_test_membership a where a.test_name='points_expiring_OMD'
                    and a.group_name='CONTROL' and a.line_user_id=b.line_user_id)
    and not exists (select 1 from "MessageLog" m where m."automationId"='auto_points_expiring_200_omd'
                    and m."customerId"=b.customer_id)
  order by b.expiry_date, b.current_points desc limit p_daily_cap;

  update "Customer" c set tags=array_append(c.tags,'points:OMD:exp30_redeemable'), "updatedAt"=now()
  from _p1 where c.id=_p1.customer_id and c."brandId"=v_brand;

  -- 2) 90–199 แต้ม · หมดอายุ 30 วัน → Ordinary Set
  create temporary table _p2 on commit drop as
  select b.customer_id from _base b
  where b.current_points between 90 and 199 and b.expiry_date <= current_date + 30
    and not exists (select 1 from _p1 where _p1.customer_id=b.customer_id)
    and not exists (select 1 from ab_test_membership a where a.test_name='points_expiring_OMD'
                    and a.group_name='CONTROL' and a.line_user_id=b.line_user_id)
    and not exists (select 1 from "MessageLog" m where m."automationId"='auto_points_expiring_ordinary_omd'
                    and m."customerId"=b.customer_id)
  order by b.expiry_date, b.current_points desc limit p_daily_cap;

  update "Customer" c set tags=array_append(c.tags,'points:OMD:exp30_ordinary'), "updatedAt"=now()
  from _p2 where c.id=_p2.customer_id and c."brandId"=v_brand;

  -- 3) 60–89 แต้ม · หมดอายุ 30 วัน → Comfort Set
  create temporary table _p3 on commit drop as
  select b.customer_id from _base b
  where b.current_points between 60 and 89 and b.expiry_date <= current_date + 30
    and not exists (select 1 from _p1 where _p1.customer_id=b.customer_id)
    and not exists (select 1 from _p2 where _p2.customer_id=b.customer_id)
    and not exists (select 1 from ab_test_membership a where a.test_name='points_expiring_OMD'
                    and a.group_name='CONTROL' and a.line_user_id=b.line_user_id)
    and not exists (select 1 from "MessageLog" m where m."automationId"='auto_points_expiring_comfort_omd'
                    and m."customerId"=b.customer_id)
  order by b.expiry_date, b.current_points desc limit p_daily_cap;

  update "Customer" c set tags=array_append(c.tags,'points:OMD:exp30_comfort'), "updatedAt"=now()
  from _p3 where c.id=_p3.customer_id and c."brandId"=v_brand;

  -- 4) near200 — ทั้งแถบไว้ดูขนาด แล้วค่อยเลือกคิวที่ส่งจริง
  update "Customer" c set tags=array_append(c.tags,'points:OMD:near200'), "updatedAt"=now()
  from _base b where c.id=b.customer_id and c."brandId"=v_brand
    and b.current_points between 150 and 199;

  update "Customer" c
  set tags=array_append(c.tags,'points:OMD:near200_active90'), "updatedAt"=now()
  where c."brandId"=v_brand and c.id in (
    select b.customer_id from _base b
    where b.current_points between 150 and 199
      and b.last_access >= current_date - 90
      and not exists (select 1 from _p1 where _p1.customer_id=b.customer_id)
      and (not v_ord_active  or not exists (select 1 from _p2 where _p2.customer_id=b.customer_id))
      and (not v_comf_active or not exists (select 1 from _p3 where _p3.customer_id=b.customer_id))
      and not exists (select 1 from ab_test_membership a where a.test_name='points_near200_OMD'
                      and a.group_name='CONTROL' and a.line_user_id=b.line_user_id)
      and not exists (select 1 from "MessageLog" m where m."automationId"='auto_points_near200_omd'
                      and m."customerId"=b.customer_id)
    order by b.current_points desc, b.last_access desc limit p_daily_cap);

  -- ตรวจการรั่วข้ามแบรนด์ เจอเมื่อไหร่ล้มทั้ง transaction
  select count(*) into v_leak from "Customer"
  where "brandId" is distinct from v_brand
    and tags && array['points:OMD:near200','points:OMD:near200_active90',
                      'points:OMD:exp30_redeemable','points:OMD:exp30_ordinary',
                      'points:OMD:exp30_comfort'];
  if v_leak > 0 then
    raise exception 'tag ของ OMD ไปโผล่ที่ลูกค้าแบรนด์อื่น % ราย — ยกเลิกรอบนี้ทั้งหมด', v_leak;
  end if;

  update "Segment" s
  set "memberCount"=(select count(*) from "Customer" c
                     where c.tags @> array[(s.conditions->'conditions'->0->>'value')::text]),
      "lastCountAt"=now(), "updatedAt"=now()
  where s.id in ('seg_omd_near200','seg_omd_near200_active90','seg_omd_exp30_redeemable',
                 'seg_omd_exp30_near','seg_omd_exp30_ordinary','seg_omd_exp30_comfort');

  return query select
    (select "memberCount" from "Segment" where id='seg_omd_exp30_redeemable'),
    (select "memberCount" from "Segment" where id='seg_omd_exp30_ordinary'),
    (select "memberCount" from "Segment" where id='seg_omd_exp30_comfort'),
    (select "memberCount" from "Segment" where id='seg_omd_near200_active90'),
    (select "memberCount" from "Segment" where id='seg_omd_near200');
end;
$fn$;

comment on function public.refresh_omd_point_tiers(int) is
  'OMD ข้อความเรื่องแต้มทั้งหมด: รีเฟรชรายวันตามบันไดรางวัลและลำดับความสำคัญ (ดู web/sql/cdp/ ใน repo Marketing-OS)';

select cron.schedule('omd-near200-refresh', '40 4 * * *',
       $$select public.refresh_omd_point_tiers();$$);

-- คำสั่งที่ใช้บ่อย
--   select * from public.refresh_omd_point_tiers();     -- รันมือ cap ปกติ 250
--   select * from cron.job;                             -- job ยังตั้งอยู่ไหม
--   select jobid, status, start_time, return_message
--     from cron.job_run_details order by start_time desc limit 5;
--   select cron.unschedule('omd-near200-refresh');       -- หยุดรีเฟรชทั้งหมด
