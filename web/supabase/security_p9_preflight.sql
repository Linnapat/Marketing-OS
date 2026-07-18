-- preflight ของ security_p9 — รันก่อน apply เสมอ
-- คำถามเดียวที่ต้องตอบ: มีสมาชิกคนไหนที่ scope จะ parse ไม่ออกภายใต้กติกา
-- fail-closed ใหม่บ้าง (= จะมองไม่เห็นแบรนด์ใดเลยหลังเปิด RLS)
-- ต้องรัน "หลัง" สร้าง functions ใน security_p9 แล้ว (ส่วน functions อย่างเดียว
-- ยังไม่แตะ policy) หรือใช้เวอร์ชัน manual ด้านล่างที่ไม่พึ่ง function
--
-- เวอร์ชัน manual (ไม่ต้องมี function): สมาชิกที่ scope ไม่ใช่ All brands /
-- ว่าง / External only และไม่มีชื่อแบรนด์ที่รู้จักอยู่ในข้อความเลย = เสี่ยงล็อกเอาต์

select email, name, role, access, brand_access,
  case
    when access = 'Admin' then 'OK — admin เห็นหมด'
    when btrim(coalesce(brand_access,'')) = '' or brand_access ~* '^all brands$' then 'OK — all brands'
    when brand_access ~* 'external only' then 'ตั้งใจ — external ไม่เห็นแบรนด์'
    when brand_access ~* 'teppen|omakase|omd|mainichi|touka' then 'OK — จับคู่แบรนด์ได้'
    else '⚠ ตรวจด่วน: scope นี้จะ parse ไม่ออก → มองไม่เห็นข้อมูลเลยหลังเปิด RLS'
  end as p9_result
from members
order by p9_result desc, email;
