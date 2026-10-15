-- OMD · ข้อความ "แต้มพอแลกแล้วแต่ใกล้หมดอายุ" — ขา B ของเทสข้อความเรื่องแต้ม
--
-- ที่มา: ข้อความเดิม "อีกนิดเดียวก็ครบ 200 แต้ม" ครบ 30 วันแล้ววัดไม่พบ lift
-- (18.9% เทียบ control 23.6% ซึ่งต่างกันในกรอบความคลาดเคลื่อน ดู README)
-- สมมติฐานว่าทำไมไม่เวิร์ก: การ์ดบอกสิ่งที่ลูกค้าเปิดบัตรสมาชิกดูเองได้
-- ไม่มีเส้นตาย และ "อีกไม่เกิน 500 บาท" สำหรับแบรนด์บิลเฉลี่ย 588 บาท
-- อ่านได้ว่า "ยังอีกไกล" ไม่ใช่ "อีกนิดเดียว"
--
-- ขา B เปลี่ยนกรอบจาก "ใกล้ได้" เป็น "กำลังจะเสีย" และเลือกกลุ่มที่ทำได้จริง:
-- แต้ม >= 200 อยู่แล้ว (แลก Omakase Don ได้ทันที) และแต้มจะหมดอายุใน 30 วัน
-- คนกลุ่มนี้ไม่ต้องสะสมเพิ่มเลย แค่เดินเข้าร้าน — ข้อเสนอที่เอื้อมถึงจริง
--
-- ส่งทั้งคนที่ยังมาอยู่และคนที่หายไปแล้ว ต่างจากข้อความเดิมที่ส่งแค่คนมาใน 90 วัน
-- เพราะของที่กำลังจะเสียเป็นเหตุผลกลับมาที่ใช้ได้กับคนที่หายไปด้วย
-- ตอนตั้ง (15 ต.ค. 2026): อยู่ในหน้าต่าง 30 วัน 223 คน · ยังมาอยู่ 126 · หายไปแล้วที่เหลือ
--
-- holdout 15% เก็บใน ab_test_membership test_name = 'points_expiring_OMD'
-- salt ต่างจากเทสเดิม ไม่ให้คนกลุ่มเดิมเป็น control ซ้ำทุกเทส

-- 1) ข้อความ -------------------------------------------------------------
--    สีส้ม #E8590C (accent ของ OMD) ใช้กับตัวเลขวันหมดอายุ หัวการ์ดยังเป็นน้ำเงินแบรนด์
--    คำพูดทุกบรรทัดต้องจริงกับทุกคนในกลุ่ม: ทุกคนมี >= 200 แต้ม และหมดอายุใน <= 30 วัน
insert into "FlexTemplate" (id, name, "altText", "flexJson", variables, "brandCode", "createdAt", "updatedAt")
values (
  'tpl_points_expiring_redeemable_omd_v1',
  'แต้มพอแลกแล้วแต่ใกล้หมดอายุ — OMD',
  'แต้มของคุณพอแลก Omakase Don แล้ว แต่จะหมดอายุใน 30 วัน',
  $flex${
    "type": "bubble",
    "size": "mega",
    "header": {
      "type": "box", "layout": "vertical", "backgroundColor": "#1F6FEB", "paddingAll": "20px",
      "contents": [
        {"type": "text", "text": "OMD by TEPPEN", "size": "xxs", "color": "#BFDBFF", "weight": "bold"},
        {"type": "text", "text": "แต้มคุณพอแลก Omakase Don แล้ว 🍣", "size": "lg", "color": "#FFFFFF", "weight": "bold", "wrap": true, "margin": "sm"}
      ]
    },
    "body": {
      "type": "box", "layout": "vertical", "paddingAll": "20px",
      "contents": [
        {"type": "text", "text": "คุณ {{customer.name}} มีแต้มครบ 200 แต้มแล้วนะคะ", "size": "sm", "color": "#1B2A41", "wrap": true},
        {
          "type": "box", "layout": "vertical", "margin": "lg", "paddingAll": "16px",
          "cornerRadius": "12px", "backgroundColor": "#FFF1E6",
          "contents": [
            {"type": "text", "text": "แต่แต้มจะหมดอายุภายใน", "size": "sm", "align": "center", "color": "#8A3D06", "weight": "bold"},
            {"type": "text", "text": "30 วัน", "size": "xxl", "align": "center", "color": "#E8590C", "weight": "bold", "margin": "xs"},
            {"type": "separator", "color": "#F5CBA8", "margin": "md"},
            {"type": "text", "text": "ใช้แลก Omakase Don ได้เลยที่ร้าน ไม่ต้องสะสมเพิ่มแล้วค่ะ", "size": "sm", "align": "center", "color": "#1B2A41", "weight": "bold", "wrap": true, "margin": "md"},
            {"type": "text", "text": "แต้มที่หมดอายุแล้วนำกลับมาใช้ไม่ได้", "size": "xxs", "align": "center", "color": "#8A3D06", "wrap": true, "margin": "sm"}
          ]
        },
        {"type": "text", "text": "เช็กแต้มและวันหมดอายุได้ที่บัตรสมาชิกใน LINE", "size": "xxs", "align": "center", "color": "#8CA0B3", "wrap": true, "margin": "md"}
      ]
    },
    "footer": {
      "type": "box", "layout": "vertical", "paddingAll": "16px",
      "contents": [
        {"type": "text", "text": "แล้วพบกันที่ OMD นะคะ 🍣", "size": "xxs", "align": "center", "color": "#8CA0B3"}
      ]
    }
  }$flex$::jsonb,
  array['customer.name'], 'OMD', now(), now()
)
on conflict (id) do update
set name = excluded.name, "altText" = excluded."altText", "flexJson" = excluded."flexJson",
    variables = excluded.variables, "updatedAt" = now();

-- 2) Segment -------------------------------------------------------------
insert into "Segment" (id, name, description, conditions, "memberCount", "brandCode", "createdAt", "updatedAt")
values
  ('seg_omd_exp30_redeemable',
   '[OMD] แต้มพอแลกแล้ว · หมดอายุใน 30 วัน',
   'สมาชิก OMD ที่มีแต้ม >= 200 (แลก Omakase Don ได้ทันที) และแต้มจะหมดอายุภายใน 30 วัน — ขา B ของเทสข้อความ',
   '{"logic":"AND","conditions":[{"field":"tags","value":"points:OMD:exp30_redeemable","operator":"contains"}]}'::jsonb,
   0, 'OMD', now(), now()),
  ('seg_omd_exp30_near',
   '[OMD] แต้ม 100–199 · หมดอายุใน 30 วัน',
   'สมาชิก OMD ที่มีแต้ม 100–199 และแต้มจะหมดอายุภายใน 30 วัน — ยังไม่ส่ง รอตัดสินใจเรื่องของรางวัลที่เอื้อมถึง',
   '{"logic":"AND","conditions":[{"field":"tags","value":"points:OMD:exp30_near","operator":"contains"}]}'::jsonb,
   0, 'OMD', now(), now())
on conflict (id) do update
set name = excluded.name, description = excluded.description,
    conditions = excluded.conditions, "updatedAt" = now();

-- 3) Automation ----------------------------------------------------------
-- ACTIVE · 1 ครั้ง/คน · เว้น 720 ชม. · หยุดเมื่อลูกค้ามาร้าน
-- ไม่มี automation ของ seg_omd_exp30_near ตั้งใจ — ดูเหตุผลใน README
insert into "Automation" (id, name, status, trigger, steps, "segmentId", "brandCode",
                          "frequencyCapHours", "maxSendsPerCustomer", "stopOnVisit",
                          "createdAt", "updatedAt")
values (
  'auto_points_expiring_200_omd',
  'แต้มพอแลกแล้วแต่ใกล้หมดอายุ — OMD',
  'ACTIVE',
  '{"type":"scheduled"}'::jsonb,
  '[{"type":"send_flex","templateId":"tpl_points_expiring_redeemable_omd_v1"}]'::jsonb,
  'seg_omd_exp30_redeemable',
  'OMD', 720, 1, true, now(), now()
)
on conflict (id) do update
set name = excluded.name, trigger = excluded.trigger, steps = excluded.steps,
    "segmentId" = excluded."segmentId", "frequencyCapHours" = excluded."frequencyCapHours",
    "maxSendsPerCustomer" = excluded."maxSendsPerCustomer",
    "stopOnVisit" = excluded."stopOnVisit", "updatedAt" = now();
