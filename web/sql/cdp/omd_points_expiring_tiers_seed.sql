-- OMD · ข้อความแต้มใกล้หมดอายุ ขั้น Ordinary (90) และ Comfort (60)
--
-- เปิดตามบันไดรางวัลจริงของโปรแกรมสมาชิก (artwork 15 ต.ค. 2026)
-- ก่อนหน้านี้ปิดกลุ่มแต้ม 100–199 ไปเพราะเข้าใจว่าบันไดมีขั้นเดียวที่ 200
-- ซึ่งไม่จริง — ขั้น 60 และ 90 มีอยู่ คนกลุ่มนี้แลกได้ตั้งแต่ 60 แต้ม
--
-- ทั้งสองตัวตั้งเป็น DRAFT ตั้งใจ — ต้องยืนยันก่อนว่าหน้าร้านรับแลกขั้น 60/90
-- ได้จริงแล้ว ถ้าส่งไปแล้วพนักงานปฏิเสธ เสียความเชื่อมั่นมากกว่าได้ยอด
-- เปลี่ยนเป็น ACTIVE ได้ที่หน้า CDP เมื่อยืนยันแล้ว ลำดับความสำคัญในฟังก์ชัน
-- รายวันจะมีผลเองทันที (ดู omd_point_messages_daily.sql)
--
-- คำพูดทุกบรรทัดจริงกับทุกคนในกลุ่ม: Ordinary = ทุกคนมี >= 90 แต้ม
-- Comfort = ทุกคนมี >= 60 แต้ม และทั้งคู่หมดอายุภายใน 30 วัน
-- ไม่ระบุยอดบิลขั้นต่ำเป็นตัวเลข เพราะ artwork ระบุขั้นต่ำไว้ชัดเฉพาะ Omakase Don
-- (บิล 300 บาท) ขั้นอื่นเขียนรวมว่า "มีการกำหนดยอดขั้นต่ำ โปรดตรวจสอบเงื่อนไข"
-- จึงให้การ์ดบอกว่าสอบถามพนักงาน แทนการเดาตัวเลขแล้วผิด

insert into "FlexTemplate" (id, name, "altText", "flexJson", variables, "brandCode", "createdAt", "updatedAt")
values
('tpl_points_expiring_ordinary_omd_v1',
 'แต้มใกล้หมดอายุ · แลก Ordinary Set — OMD',
 'แต้มของคุณจะหมดอายุใน 30 วัน แลก Ordinary Set ได้เลย',
 $f1${"type":"bubble","size":"mega",
  "header":{"type":"box","layout":"vertical","backgroundColor":"#1F6FEB","paddingAll":"20px","contents":[
    {"type":"text","text":"OMD by TEPPEN","size":"xxs","color":"#BFDBFF","weight":"bold"},
    {"type":"text","text":"แต้มคุณแลก Ordinary Set ได้แล้ว 🍚","size":"lg","color":"#FFFFFF","weight":"bold","wrap":true,"margin":"sm"}]},
  "body":{"type":"box","layout":"vertical","paddingAll":"20px","contents":[
    {"type":"text","text":"คุณ {{customer.name}} สะสมแต้มไว้เกิน 90 แต้มแล้วนะคะ","size":"sm","color":"#1B2A41","wrap":true},
    {"type":"box","layout":"vertical","margin":"lg","paddingAll":"16px","cornerRadius":"12px","backgroundColor":"#FFF1E6","contents":[
      {"type":"text","text":"แต่แต้มจะหมดอายุภายใน","size":"sm","align":"center","color":"#8A3D06","weight":"bold"},
      {"type":"text","text":"30 วัน","size":"xxl","align":"center","color":"#E8590C","weight":"bold","margin":"xs"},
      {"type":"separator","color":"#F5CBA8","margin":"md"},
      {"type":"text","text":"แลก Ordinary Set (มูลค่า 90.-) ได้เลยที่ร้าน ไม่ต้องรอสะสมถึง 200","size":"sm","align":"center","color":"#1B2A41","weight":"bold","wrap":true,"margin":"md"},
      {"type":"text","text":"แต้มที่หมดอายุแล้วนำกลับมาใช้ไม่ได้","size":"xxs","align":"center","color":"#8A3D06","wrap":true,"margin":"sm"}]},
    {"type":"text","text":"มีเงื่อนไขยอดบิลขั้นต่ำ สอบถามพนักงานได้ที่ร้าน","size":"xxs","align":"center","color":"#8CA0B3","wrap":true,"margin":"md"},
    {"type":"text","text":"เช็กแต้มและวันหมดอายุได้ที่บัตรสมาชิกใน LINE","size":"xxs","align":"center","color":"#8CA0B3","wrap":true,"margin":"xs"}]},
  "footer":{"type":"box","layout":"vertical","paddingAll":"16px","contents":[
    {"type":"text","text":"แล้วพบกันที่ OMD นะคะ 🍣","size":"xxs","align":"center","color":"#8CA0B3"}]}}$f1$::jsonb,
 array['customer.name'],'OMD',now(),now()),
('tpl_points_expiring_comfort_omd_v1',
 'แต้มใกล้หมดอายุ · แลก Comfort Set — OMD',
 'แต้มของคุณจะหมดอายุใน 30 วัน แลก Comfort Set ได้เลย',
 $f2${"type":"bubble","size":"mega",
  "header":{"type":"box","layout":"vertical","backgroundColor":"#1F6FEB","paddingAll":"20px","contents":[
    {"type":"text","text":"OMD by TEPPEN","size":"xxs","color":"#BFDBFF","weight":"bold"},
    {"type":"text","text":"แต้มคุณแลก Comfort Set ได้แล้ว 🍵","size":"lg","color":"#FFFFFF","weight":"bold","wrap":true,"margin":"sm"}]},
  "body":{"type":"box","layout":"vertical","paddingAll":"20px","contents":[
    {"type":"text","text":"คุณ {{customer.name}} สะสมแต้มไว้เกิน 60 แต้มแล้วนะคะ","size":"sm","color":"#1B2A41","wrap":true},
    {"type":"box","layout":"vertical","margin":"lg","paddingAll":"16px","cornerRadius":"12px","backgroundColor":"#FFF1E6","contents":[
      {"type":"text","text":"แต่แต้มจะหมดอายุภายใน","size":"sm","align":"center","color":"#8A3D06","weight":"bold"},
      {"type":"text","text":"30 วัน","size":"xxl","align":"center","color":"#E8590C","weight":"bold","margin":"xs"},
      {"type":"separator","color":"#F5CBA8","margin":"md"},
      {"type":"text","text":"แลก Comfort Set (มูลค่า 60.-) ได้เลยที่ร้าน ก่อนแต้มหาย","size":"sm","align":"center","color":"#1B2A41","weight":"bold","wrap":true,"margin":"md"},
      {"type":"text","text":"แต้มที่หมดอายุแล้วนำกลับมาใช้ไม่ได้","size":"xxs","align":"center","color":"#8A3D06","wrap":true,"margin":"sm"}]},
    {"type":"text","text":"มีเงื่อนไขยอดบิลขั้นต่ำ สอบถามพนักงานได้ที่ร้าน","size":"xxs","align":"center","color":"#8CA0B3","wrap":true,"margin":"md"},
    {"type":"text","text":"เช็กแต้มและวันหมดอายุได้ที่บัตรสมาชิกใน LINE","size":"xxs","align":"center","color":"#8CA0B3","wrap":true,"margin":"xs"}]},
  "footer":{"type":"box","layout":"vertical","paddingAll":"16px","contents":[
    {"type":"text","text":"แล้วพบกันที่ OMD นะคะ 🍣","size":"xxs","align":"center","color":"#8CA0B3"}]}}$f2$::jsonb,
 array['customer.name'],'OMD',now(),now())
on conflict (id) do update
set name=excluded.name, "altText"=excluded."altText", "flexJson"=excluded."flexJson",
    variables=excluded.variables, "updatedAt"=now();

insert into "Segment" (id, name, description, conditions, "memberCount", "brandCode", "createdAt", "updatedAt")
values
 ('seg_omd_exp30_ordinary','[OMD] แต้ม 90–199 · หมดอายุใน 30 วัน',
  'แลก Ordinary Set (90 แต้ม) ได้แล้ว และแต้มจะหมดอายุใน 30 วัน',
  '{"logic":"AND","conditions":[{"field":"tags","value":"points:OMD:exp30_ordinary","operator":"contains"}]}'::jsonb,
  0,'OMD',now(),now()),
 ('seg_omd_exp30_comfort','[OMD] แต้ม 60–89 · หมดอายุใน 30 วัน',
  'แลก Comfort Set (60 แต้ม) ได้แล้ว และแต้มจะหมดอายุใน 30 วัน',
  '{"logic":"AND","conditions":[{"field":"tags","value":"points:OMD:exp30_comfort","operator":"contains"}]}'::jsonb,
  0,'OMD',now(),now())
on conflict (id) do update
set name=excluded.name, description=excluded.description, conditions=excluded.conditions, "updatedAt"=now();

insert into "Automation" (id, name, status, trigger, steps, "segmentId", "brandCode",
                          "frequencyCapHours", "maxSendsPerCustomer", "stopOnVisit", "createdAt", "updatedAt")
values
 ('auto_points_expiring_ordinary_omd','แต้มใกล้หมดอายุ · แลก Ordinary Set — OMD','DRAFT',
  '{"type":"scheduled"}'::jsonb,
  '[{"type":"send_flex","templateId":"tpl_points_expiring_ordinary_omd_v1"}]'::jsonb,
  'seg_omd_exp30_ordinary','OMD',720,1,true,now(),now()),
 ('auto_points_expiring_comfort_omd','แต้มใกล้หมดอายุ · แลก Comfort Set — OMD','DRAFT',
  '{"type":"scheduled"}'::jsonb,
  '[{"type":"send_flex","templateId":"tpl_points_expiring_comfort_omd_v1"}]'::jsonb,
  'seg_omd_exp30_comfort','OMD',720,1,true,now(),now())
on conflict (id) do update
set name=excluded.name, trigger=excluded.trigger, steps=excluded.steps,
    "segmentId"=excluded."segmentId", "updatedAt"=now();
