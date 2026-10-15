-- OMD · งานรายวันของข้อความเรื่องแต้มทุกตัว รวมเป็นฟังก์ชันเดียว
--
-- ติดตั้งจริงใน CDP แล้วด้วย migration `omd_point_messages_unified_daily`
-- pg_cron job `omd-near200-refresh` เวลา 04:40 UTC = 11:40 น. ไทย ทุกวัน
-- (ตั้งหลัง Loga sync ที่เขียน `customers` เสร็จช่วง 04:00–04:21 UTC)
--
-- ทำไมต้องรวมเป็นฟังก์ชันเดียว
-- พอมีข้อความเรื่องแต้มมากกว่า 1 ตัว ลูกค้าคนเดียวเข้าเกณฑ์ได้หลายตัวพร้อมกัน
-- (แต้ม 150–199 ที่กำลังจะหมดอายุ เข้าได้ทั้งสองข้อความ) ถ้าแยกฟังก์ชันกันคำนวณ
-- ต่างตัวต่างติด tag แล้วลูกค้าได้ 2 ข้อความเรื่องแต้มในวันเดียว
-- ฟังก์ชันเดียวที่ไล่ตามลำดับความสำคัญกันปัญหานี้ที่ต้นทาง ไม่ใช่ไปแก้ทีหลัง
--
-- ลำดับความสำคัญ — คนหนึ่งได้ tag ที่ส่งจริงได้ใบเดียว
--   1. exp30_redeemable  แต้ม >= 200 และหมดอายุใน 30 วัน
--      เร่งที่สุด: ของที่แลกได้อยู่แล้วกำลังจะหาย ไม่ต้องทำอะไรนอกจากเดินเข้าร้าน
--      ส่งทั้งคนที่ยังมาอยู่และคนที่หายไปแล้ว — ของที่กำลังจะเสียเป็นเหตุผล
--      กลับมาที่ใช้ได้กับคนที่หายไปด้วย ต่างจาก "อีกนิดเดียวก็ครบ"
--   2. near200           แต้ม 150–199 มาใน 90 วัน — ข้อความเดิม
--      ผล 30 วันแรก: ไม่พบ lift ที่วัดได้ (ดู README) ปล่อยวิ่งเป็นฐานเทียบ
--   3. exp30_near        แต้ม 100–199 หมดอายุใน 30 วัน — คำนวณไว้ดูขนาดกลุ่ม
--      ยังไม่มี automation ส่ง เพราะคนกลุ่มนี้ต้องใช้อีกถึง ~1,000 บาทใน 30 วัน
--      จึงจะแลกได้ บอกว่าของกำลังจะหายโดยที่เอื้อมไม่ถึงมีแต่ทำให้หงุดหงิด
--      จึงไม่กัน near200 ด้วย — คนที่เข้าทั้งคู่ให้ได้ near200 ซึ่งพอทำได้
--
-- ล็อกแบรนด์: OMD เท่านั้น ทุก statement กรองแบรนด์ และตรวจการรั่วก่อนจบทุกรอบ
-- เจอ tag ของ OMD ไปโผล่แบรนด์อื่นแม้แต่รายเดียว ล้มทั้ง transaction
--
-- ดูก่อนรัน: select * from public.refresh_omd_point_messages(0);  -- cap 0 = ไม่ติด tag ที่ส่งจริง

create extension if not exists pg_cron;

create or replace function public.refresh_omd_point_messages(p_daily_cap int default 250)
returns table (exp30_redeemable int, near200_queue int, exp30_near int, band_150_199 int)
language plpgsql
as $fn$
declare
  v_brand text;
  v_leak  int;
begin
  select id into v_brand from "Brand" where code = 'OMD';
  if v_brand is null then
    raise exception 'ไม่พบแบรนด์ OMD ใน Brand — หยุดก่อน ไม่เดาแบรนด์';
  end if;

  -- ฐานร่วม: สมาชิก OMD ที่ยัง consent · มีแต้มเหลือ · แต้มยังไม่หมดอายุ
  create temporary table _base on commit drop as
  select c.id as customer_id, c."lineUserId" as line_user_id,
         l.current_points, l.last_access, l.expiry_date
  from customers l
  join "Customer" c
    on c."lineUserId" = l.line_user_id
   and c."brandId" = v_brand
  where l.brand = 'OMD'
    and l.current_points > 0
    and l.expiry_date >= current_date
    and c."consentStatus"::text <> 'REVOKED';

  -- holdout เทส "แต้มใกล้หมดอายุ" 15% — salt ต่างจากเทส near200
  -- ไม่ให้คนกลุ่มเดิมเป็น control ซ้ำทุกเทส (ไม่งั้นมีคนไม่ได้รับข้อความอะไรเลยตลอด)
  insert into ab_test_membership (test_name, group_name, line_user_id, assigned_at)
  select 'points_expiring_OMD',
         case when ('x' || substr(md5('exp:' || line_user_id), 1, 8))::bit(32)::bigint % 100 < 15
              then 'CONTROL' else 'TEST_B' end,
         line_user_id, now()
  from _base
  where current_points >= 100 and expiry_date <= current_date + 30
  on conflict do nothing;

  -- holdout เทสเดิม คงการแบ่งไว้ไม่เปลี่ยน
  insert into ab_test_membership (test_name, group_name, line_user_id, assigned_at)
  select 'points_near200_OMD',
         case when ('x' || substr(md5(line_user_id), 1, 8))::bit(32)::bigint % 10 = 0
              then 'CONTROL' else 'TEST_B' end,
         line_user_id, now()
  from _base
  where current_points between 150 and 199
  on conflict do nothing;

  -- ล้าง tag ทุกใบของรอบก่อน เฉพาะแถวแบรนด์ OMD
  update "Customer"
  set tags = array_remove(array_remove(array_remove(array_remove(
               tags, 'points:OMD:near200'), 'points:OMD:near200_active90'),
               'points:OMD:exp30_redeemable'), 'points:OMD:exp30_near'),
      "updatedAt" = now()
  where "brandId" = v_brand
    and tags && array['points:OMD:near200', 'points:OMD:near200_active90',
                      'points:OMD:exp30_redeemable', 'points:OMD:exp30_near'];

  -- 1) exp30_redeemable — เรียงคนที่แต้มหมดอายุเร็วที่สุดก่อน
  create temporary table _p1 on commit drop as
  select b.customer_id
  from _base b
  where b.current_points >= 200
    and b.expiry_date <= current_date + 30
    and not exists (select 1 from ab_test_membership a
                    where a.test_name='points_expiring_OMD' and a.group_name='CONTROL'
                      and a.line_user_id = b.line_user_id)
    and not exists (select 1 from "MessageLog" m
                    where m."automationId"='auto_points_expiring_200_omd'
                      and m."customerId" = b.customer_id)
  order by b.expiry_date, b.current_points desc
  limit p_daily_cap;

  update "Customer" c
  set tags = array_append(c.tags, 'points:OMD:exp30_redeemable'), "updatedAt" = now()
  from _p1 where c.id = _p1.customer_id and c."brandId" = v_brand;

  -- 2) near200 — ทั้งแถบไว้ดูขนาดกลุ่ม
  update "Customer" c
  set tags = array_append(c.tags, 'points:OMD:near200'), "updatedAt" = now()
  from _base b
  where c.id = b.customer_id and c."brandId" = v_brand
    and b.current_points between 150 and 199;

  --    คิวที่ส่งจริง: ตัดคนที่ได้ tag ข้อความด่วนไปแล้วออก
  update "Customer" c
  set tags = array_append(c.tags, 'points:OMD:near200_active90'), "updatedAt" = now()
  where c."brandId" = v_brand
    and c.id in (
      select b.customer_id from _base b
      where b.current_points between 150 and 199
        and b.last_access >= current_date - 90
        and not exists (select 1 from _p1 where _p1.customer_id = b.customer_id)
        and not exists (select 1 from ab_test_membership a
                        where a.test_name='points_near200_OMD' and a.group_name='CONTROL'
                          and a.line_user_id = b.line_user_id)
        and not exists (select 1 from "MessageLog" m
                        where m."automationId"='auto_points_near200_omd'
                          and m."customerId" = b.customer_id)
      order by b.current_points desc, b.last_access desc
      limit p_daily_cap
    );

  -- 3) exp30_near — tag ไว้ดูขนาดกลุ่ม ยังไม่ส่ง
  update "Customer" c
  set tags = array_append(c.tags, 'points:OMD:exp30_near'), "updatedAt" = now()
  from _base b
  where c.id = b.customer_id and c."brandId" = v_brand
    and b.current_points between 100 and 199
    and b.expiry_date <= current_date + 30
    and not exists (select 1 from _p1 where _p1.customer_id = b.customer_id);

  -- ตรวจการรั่วข้ามแบรนด์
  select count(*) into v_leak from "Customer"
  where "brandId" is distinct from v_brand
    and tags && array['points:OMD:near200', 'points:OMD:near200_active90',
                      'points:OMD:exp30_redeemable', 'points:OMD:exp30_near'];
  if v_leak > 0 then
    raise exception 'tag ของ OMD ไปโผล่ที่ลูกค้าแบรนด์อื่น % ราย — ยกเลิกรอบนี้ทั้งหมด', v_leak;
  end if;

  update "Segment" s
  set "memberCount" = (select count(*) from "Customer" c
                       where c.tags @> array[(s.conditions->'conditions'->0->>'value')::text]),
      "lastCountAt" = now(), "updatedAt" = now()
  where s.id in ('seg_omd_near200', 'seg_omd_near200_active90',
                 'seg_omd_exp30_redeemable', 'seg_omd_exp30_near');

  return query select
    (select "memberCount" from "Segment" where id='seg_omd_exp30_redeemable'),
    (select "memberCount" from "Segment" where id='seg_omd_near200_active90'),
    (select "memberCount" from "Segment" where id='seg_omd_exp30_near'),
    (select "memberCount" from "Segment" where id='seg_omd_near200');
end;
$fn$;

-- ตัวเก่ากลายเป็นทางผ่าน กันคนเผลอรันแล้วลำดับความสำคัญหาย
create or replace function public.refresh_omd_near200(p_daily_cap int default 250)
returns table (tagged_band int, queued_today int)
language plpgsql
as $old$
begin
  raise notice 'ฟังก์ชันนี้ถูกแทนด้วย refresh_omd_point_messages() แล้ว — เรียกต่อให้';
  return query
    select r.band_150_199, r.near200_queue
    from public.refresh_omd_point_messages(p_daily_cap) r;
end;
$old$;

comment on function public.refresh_omd_point_messages(int) is
  'OMD ข้อความเรื่องแต้มทั้งหมด: รีเฟรชรายวันตามลำดับความสำคัญ กันคนเดียวได้หลายข้อความ (ดู web/sql/cdp/ ใน repo Marketing-OS)';

select cron.schedule('omd-near200-refresh', '40 4 * * *',
       $$select public.refresh_omd_point_messages();$$);

-- คำสั่งที่ใช้บ่อย
--   select * from public.refresh_omd_point_messages();   -- รันมือ cap ปกติ 250
--   select * from cron.job;                              -- job ยังตั้งอยู่ไหม
--   select jobid, status, start_time, return_message
--     from cron.job_run_details order by start_time desc limit 5;
--   select cron.unschedule('omd-near200-refresh');        -- หยุดรีเฟรชทั้งหมด
