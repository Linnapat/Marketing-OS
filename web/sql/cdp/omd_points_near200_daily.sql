-- OMD · แจ้งเตือน "ใกล้ครบ 200 แต้ม" — งานรีเฟรชกลุ่มเป้าหมายรายวัน
--
-- ติดตั้งจริงใน CDP แล้วด้วย migration `omd_points_near200_daily_refresh`
-- ไฟล์นี้คือสำเนาที่อ่านรีวิวได้ แก้ที่นี่แล้วรันซ้ำได้เลย (create or replace)
--
-- ตารางเวลา: pg_cron job `omd-near200-refresh` เวลา 04:40 UTC = 11:40 น. ไทย ทุกวัน
-- ตั้งหลัง Loga sync ที่เขียน `customers` เสร็จช่วง 04:00–04:21 UTC — ถ้า sync เลื่อน
-- เวลานี้ต้องเลื่อนตาม ไม่งั้นได้แต้มของเมื่อวาน
--
-- ทำไมต้องมีเพดานต่อวัน (p_daily_cap):
-- วันแรกมี backlog ค้างอยู่ ~1,880 คน ถ้าปล่อยหมดคือยิงข้อความที่ยังไม่เคยพิสูจน์
-- ใส่มือลูกค้าทั้งฐานในนัดเดียว ไม่เหลือโอกาสแก้ · สภาวะปกติมีคนเข้าแถบใหม่
-- แค่ ~10–22 คน/วัน เพดาน 250 จึงไม่เคยกระทบ flow ปกติ กระทบแค่ช่วงเคลียร์ backlog
--
-- ทำไมคนที่ได้ไปแล้วไม่โดนซ้ำ: Automation ตั้ง maxSendsPerCustomer = 1 และ
-- ฟังก์ชันนี้ยังกรอง MessageLog ซ้ำอีกชั้น — กันพลาดสองชั้นเพราะพลาดแล้วเรียกคืนไม่ได้

-- ล็อกแบรนด์: OMD เท่านั้น ห้ามแตะลูกค้า TEPPEN
-- ทุก query กรองแบรนด์ และปิดท้ายด้วยการตรวจว่ามี tag ไปโผล่แบรนด์อื่นไหม
-- เจอเมื่อไหร่ล้มทั้ง transaction — รั่วแบบเงียบ ๆ แย่กว่างานรายวันพัง เพราะข้อความ
-- ที่ส่งผิดแบรนด์ไปแล้วเรียกคืนไม่ได้

create extension if not exists pg_cron;

create or replace function public.refresh_omd_near200(p_daily_cap int default 250)
returns table (tagged_band int, queued_today int)
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

  -- 1) กลุ่มที่เข้าเกณฑ์วันนี้ (แต้ม 150–199 · แต้มยังไม่หมดอายุ · ไม่ได้ถอน consent)
  create temporary table _elig on commit drop as
  select c.id as customer_id, c."lineUserId" as line_user_id,
         l.current_points, l.last_access
  from customers l
  join "Customer" c
    on c."lineUserId" = l.line_user_id
   and c."brandId" = v_brand
  where l.brand = 'OMD'
    and l.current_points between 150 and 199
    and l.expiry_date >= current_date
    and c."consentStatus"::text <> 'REVOKED';

  -- 2) holdout 10% แบ่งด้วย hash ของ lineUserId — คนเดิมอยู่กลุ่มเดิมเสมอ
  insert into ab_test_membership (test_name, group_name, line_user_id, assigned_at)
  select 'points_near200_OMD',
         case when ('x' || substr(md5(line_user_id), 1, 8))::bit(32)::bigint % 10 = 0
              then 'CONTROL' else 'TEST_B' end,
         line_user_id, now()
  from _elig
  on conflict do nothing;

  -- 3) ล้าง tag รอบก่อน เฉพาะแถวของ OMD
  update "Customer"
  set tags = array_remove(array_remove(tags, 'points:OMD:near200'), 'points:OMD:near200_active90'),
      "updatedAt" = now()
  where "brandId" = v_brand
    and tags && array['points:OMD:near200', 'points:OMD:near200_active90'];

  -- 4) tag ทั้งแถบ ใช้ดูขนาดกลุ่ม ไม่ใช่กลุ่มที่ส่ง
  update "Customer" c
  set tags = array_append(c.tags, 'points:OMD:near200'), "updatedAt" = now()
  from _elig e where c.id = e.customer_id and c."brandId" = v_brand;

  -- 5) คิวของวันนี้ = คนที่ยังไม่เคยได้ข้อความนี้ · มาใน 90 วัน · ไม่ใช่ CONTROL
  --    เรียงคนที่ใกล้ 200 ที่สุดก่อน แล้วค่อยคนที่เพิ่งมาล่าสุด
  update "Customer" c
  set tags = array_append(c.tags, 'points:OMD:near200_active90'), "updatedAt" = now()
  where c."brandId" = v_brand
    and c.id in (
      select e.customer_id
      from _elig e
      where e.last_access >= current_date - 90
        and not exists (
          select 1 from ab_test_membership a
          where a.test_name = 'points_near200_OMD' and a.group_name = 'CONTROL'
            and a.line_user_id = e.line_user_id)
        and not exists (
          select 1 from "MessageLog" m
          where m."automationId" = 'auto_points_near200_omd' and m."customerId" = e.customer_id)
      order by e.current_points desc, e.last_access desc
      limit p_daily_cap
    );

  -- 6) ตรวจการรั่วข้ามแบรนด์ — เจอเมื่อไหร่ล้มทั้ง transaction ไม่ปล่อยผ่าน
  select count(*) into v_leak
  from "Customer"
  where "brandId" is distinct from v_brand
    and tags && array['points:OMD:near200', 'points:OMD:near200_active90'];
  if v_leak > 0 then
    raise exception 'tag ของ OMD ไปโผล่ที่ลูกค้าแบรนด์อื่น % ราย — ยกเลิกรอบนี้ทั้งหมด', v_leak;
  end if;

  -- 7) อัปเดตตัวเลขหน้า Segment ให้ตรงของจริง
  update "Segment" s
  set "memberCount" = (select count(*) from "Customer" c
                       where c.tags @> array[(s.conditions->'conditions'->0->>'value')::text]),
      "lastCountAt" = now(), "updatedAt" = now()
  where s.id in ('seg_omd_near200', 'seg_omd_near200_active90');

  return query
    select (select "memberCount" from "Segment" where id = 'seg_omd_near200'),
           (select "memberCount" from "Segment" where id = 'seg_omd_near200_active90');
end;
$fn$;

comment on function public.refresh_omd_near200(int) is
  'OMD ใกล้ครบ 200 แต้ม: รีเฟรชกลุ่มเป้าหมายรายวัน + จำกัดจำนวนคนใหม่ต่อวัน (ดู web/sql/cdp/ ใน repo Marketing-OS)';

-- ตารางเวลา (รันครั้งเดียวตอนติดตั้ง — ถ้ามี job ชื่อนี้อยู่แล้วจะทับของเดิม)
select cron.schedule('omd-near200-refresh', '40 4 * * *', $$select public.refresh_omd_near200();$$);

-- คำสั่งที่ใช้บ่อย
--   select * from public.refresh_omd_near200();        -- รันมือ ใช้เพดานปกติ 250
--   select * from public.refresh_omd_near200(1000);    -- เร่งเคลียร์ backlog เร็วขึ้น
--   select * from cron.job;                            -- ดูว่า job ยังตั้งอยู่ไหม
--   select cron.unschedule('omd-near200-refresh');     -- หยุดรีเฟรช (ข้อความจะหยุดตามเอง)
