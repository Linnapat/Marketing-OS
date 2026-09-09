-- OMD · แจ้งเตือน "ใกล้ครบ 200 แต้ม" — ตัวข้อความ + Segment + Automation
--
-- ไฟล์นี้คือ "ต้นฉบับ" ของข้อความที่ลูกค้าจะได้รับ แก้ที่นี่แล้วรันซ้ำ (upsert)
-- คู่กับ omd_points_near200_tags.sql ที่รีเฟรชกลุ่มเป้าหมายทุกวัน
--
-- Automation ตั้งเป็น DRAFT ตั้งใจ — DRAFT ไม่ส่งอะไรออกไปทั้งสิ้น
-- ต้องให้คนอนุมัติแล้วเปลี่ยนเป็น ACTIVE ในหน้า CDP เอง เพราะกดแล้วข้อความ
-- วิ่งเข้า LINE ลูกค้าจริง เรียกกลับไม่ได้
--
-- ก่อน ACTIVE ต้องเคลียร์ 1 เรื่อง: ชื่อของรางวัลที่แลกได้จริงที่ 200 แต้ม
-- ตอนนี้เขียนกลาง ๆ ว่า "ของรางวัลสมาชิก 1 สิทธิ์" เพราะระบบไม่มีข้อมูลนี้
-- ถ้าใส่ชื่อของจริงได้ (เช่น ของหวาน/เครื่องดื่ม) อัตราการกลับมาจะดีกว่านี้มาก

-- 1) ข้อความ (LINE Flex) --------------------------------------------------
insert into "FlexTemplate" (id, name, "altText", "flexJson", variables, "brandCode", "createdAt", "updatedAt")
values (
  'tpl_points_near200_omd_v1',
  'แจ้งเตือนใกล้ครบ 200 แต้ม — OMD',
  'อีกนิดเดียว แต้มของคุณใกล้ครบ 200 แต้มแล้ว 🎉',
  $flex${
    "type": "bubble",
    "size": "mega",
    "header": {
      "type": "box",
      "layout": "vertical",
      "backgroundColor": "#1F6FEB",
      "paddingAll": "20px",
      "contents": [
        {"type": "text", "text": "OMD by TEPPEN", "size": "xxs", "color": "#BFDBFF", "weight": "bold"},
        {"type": "text", "text": "อีกนิดเดียว แต้มของคุณใกล้ครบแล้ว 🎉", "size": "lg", "color": "#FFFFFF", "weight": "bold", "wrap": true, "margin": "sm"}
      ]
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "paddingAll": "20px",
      "contents": [
        {"type": "text", "text": "คุณ {{customer.name}} สะสมแต้มไว้เกิน 150 แต้มแล้วนะคะ", "size": "sm", "color": "#1B2A41", "wrap": true},
        {
          "type": "box",
          "layout": "vertical",
          "margin": "lg",
          "paddingAll": "16px",
          "cornerRadius": "12px",
          "backgroundColor": "#EAF3FF",
          "contents": [
            {"type": "text", "text": "เหลืออีกไม่ถึง", "size": "sm", "align": "center", "color": "#1B2A41", "weight": "bold"},
            {"type": "text", "text": "50 แต้ม", "size": "xxl", "align": "center", "color": "#1F6FEB", "weight": "bold", "margin": "xs"},
            {"type": "text", "text": "ก็ครบ 200 แต้ม แลกรับของรางวัลสมาชิกได้ 1 สิทธิ์", "size": "sm", "align": "center", "color": "#1B2A41", "weight": "bold", "wrap": true, "margin": "md"},
            {"type": "separator", "color": "#D6E4FF", "margin": "md"},
            {"type": "text", "text": "ทุก 10 บาท = 1 แต้ม · อีกไม่เกิน 500 บาท ก็ครบแล้วค่ะ", "size": "xxs", "align": "center", "color": "#6F8295", "wrap": true, "margin": "md"}
          ]
        },
        {"type": "text", "text": "เช็กแต้มคงเหลือได้ที่บัตรสมาชิกใน LINE ก่อนมาใช้สิทธิ์นะคะ", "size": "xxs", "align": "center", "color": "#8CA0B3", "wrap": true, "margin": "md"}
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "paddingAll": "16px",
      "contents": [
        {"type": "text", "text": "แล้วพบกันที่ OMD นะคะ 🍣", "size": "xxs", "align": "center", "color": "#8CA0B3"}
      ]
    }
  }$flex$::jsonb,
  array['customer.name'],
  'OMD',
  now(), now()
)
on conflict (id) do update
set name = excluded.name,
    "altText" = excluded."altText",
    "flexJson" = excluded."flexJson",
    variables = excluded.variables,
    "updatedAt" = now();

-- 2) Segment ---------------------------------------------------------------
-- อ่านจาก tag ที่ omd_points_near200_tags.sql คำนวณไว้ (CDP ยังไม่มี field แต้ม)
insert into "Segment" (id, name, description, conditions, "memberCount", "brandCode", "createdAt", "updatedAt")
values
  (
    'seg_omd_near200',
    '[OMD] ใกล้ครบ 200 แต้ม (150–199)',
    'สมาชิก OMD แต้มคงเหลือ 150–199 และแต้มยังไม่หมดอายุ — ทั้งแถบ ใช้ดูขนาดกลุ่ม ไม่ใช่กลุ่มที่ส่งจริง',
    '{"logic":"AND","conditions":[{"field":"tags","value":"points:OMD:near200","operator":"contains"}]}'::jsonb,
    0, 'OMD', now(), now()
  ),
  (
    'seg_omd_near200_active90',
    '[OMD] ใกล้ครบ 200 แต้ม · ยังมาอยู่ 90 วัน',
    'ซับเซ็ตของกลุ่มบน เฉพาะคนที่มาภายใน 90 วันและไม่ได้อยู่ใน holdout — กลุ่มที่ automation ส่งจริง',
    '{"logic":"AND","conditions":[{"field":"tags","value":"points:OMD:near200_active90","operator":"contains"}]}'::jsonb,
    0, 'OMD', now(), now()
  )
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    conditions = excluded.conditions,
    "updatedAt" = now();

-- 3) Automation ------------------------------------------------------------
-- maxSendsPerCustomer = 1 · frequencyCapHours = 720 (30 วัน) · stopOnVisit = true
-- ตั้งแน่นไว้ก่อนตั้งใจ: คนกลุ่มนี้ยังไม่เคยได้ข้อความแนวนี้ ถ้ารบกวนแล้วบล็อก
-- LINE OA เสียมากกว่าได้ ค่อยผ่อนทีหลังเมื่อเห็นตัวเลขรอบแรก
insert into "Automation" (id, name, status, trigger, steps, "segmentId", "brandCode",
                          "frequencyCapHours", "maxSendsPerCustomer", "stopOnVisit",
                          "createdAt", "updatedAt")
values (
  'auto_points_near200_omd',
  'แจ้งเตือนใกล้ครบ 200 แต้ม — OMD',
  'DRAFT',
  '{"type":"scheduled"}'::jsonb,
  '[{"type":"send_flex","templateId":"tpl_points_near200_omd_v1"}]'::jsonb,
  'seg_omd_near200_active90',
  'OMD',
  720, 1, true,
  now(), now()
)
on conflict (id) do update
set name = excluded.name,
    trigger = excluded.trigger,
    steps = excluded.steps,
    "segmentId" = excluded."segmentId",
    "frequencyCapHours" = excluded."frequencyCapHours",
    "maxSendsPerCustomer" = excluded."maxSendsPerCustomer",
    "stopOnVisit" = excluded."stopOnVisit",
    "updatedAt" = now();
