-- ── Trash / soft delete (7-day retention) ─────────────────────────────────
--
-- ทีมขอ "ถังขยะไว้พักงานที่ลบ เพื่อกู้คืนได้ เก็บไว้ 7 วัน" — ครอบคลุม
-- Content Plan, Campaign, Graphic Request และ My Task
--
-- วิธี: เพิ่ม deleted_at / deleted_by ต่อแถว แล้วเปลี่ยน "ลบ" ให้เป็น UPDATE
-- แทน DELETE ฝั่ง client กรอง deleted_at is null ในทุก query ปกติ และหน้า
-- Trash จะ query เฉพาะแถวที่ deleted_at ไม่ null
--
-- ไม่ต้องแก้ RLS: การ soft delete คือ UPDATE ซึ่ง staff มีสิทธิ์ตาม
-- security_p9_brand_scope อยู่แล้ว ส่วนการล้างถาวร (purge) ใช้ policy
-- delete เดิม  นั่นแปลว่าการกู้คืนก็ถูกจำกัดด้วย brand scope เหมือนกัน
-- คนที่มองไม่เห็นแบรนด์นั้นก็กู้คืนของแบรนด์นั้นไม่ได้
--
-- idempotent: รันซ้ำได้
-- rollback: soft_delete_trash_rollback.sql

-- ── 1. คอลัมน์ ───────────────────────────────────────────────────────────
alter table content_posts    add column if not exists deleted_at timestamptz;
alter table content_posts    add column if not exists deleted_by text;
alter table campaigns        add column if not exists deleted_at timestamptz;
alter table campaigns        add column if not exists deleted_by text;
alter table graphic_requests add column if not exists deleted_at timestamptz;
alter table graphic_requests add column if not exists deleted_by text;
alter table tasks            add column if not exists deleted_at timestamptz;
alter table tasks            add column if not exists deleted_by text;

-- ── 2. Index ─────────────────────────────────────────────────────────────
-- ทุก query ปกติเติม "deleted_at is null" ต่อท้าย  partial index จึงคุ้มกว่า
-- index เต็มคอลัมน์ เพราะแถวที่ถูกลบมีน้อยมากเมื่อเทียบกับแถวที่ยังอยู่
create index if not exists content_posts_live_idx    on content_posts    (id) where deleted_at is null;
create index if not exists campaigns_live_idx        on campaigns        (id) where deleted_at is null;
create index if not exists graphic_requests_live_idx on graphic_requests (id) where deleted_at is null;
create index if not exists tasks_live_idx            on tasks            (id) where deleted_at is null;

-- หน้า Trash เรียงตามเวลาที่ลบ
create index if not exists content_posts_trash_idx    on content_posts    (deleted_at desc) where deleted_at is not null;
create index if not exists campaigns_trash_idx        on campaigns        (deleted_at desc) where deleted_at is not null;
create index if not exists graphic_requests_trash_idx on graphic_requests (deleted_at desc) where deleted_at is not null;
create index if not exists tasks_trash_idx            on tasks            (deleted_at desc) where deleted_at is not null;

-- ── 3. ล้างของที่เกิน 7 วัน ──────────────────────────────────────────────
-- เรียกจาก client ตอนเปิดหน้า Trash (ดู lib/db/trash.ts) การล้างจึงเกิดขึ้น
-- จริงแม้ยังไม่ได้ตั้ง pg_cron  ถ้าภายหลังเปิด pg_cron ได้ ให้ตั้งเป็น
--   select cron.schedule('purge-trash','0 3 * * *',$$select purge_expired_trash()$$);
-- ฟังก์ชันนี้เป็น security invoker โดยตั้งใจ: ให้ RLS ยังบังคับ brand scope
-- ตามคนที่เรียก แทนที่จะเปิดช่องให้ลบข้ามแบรนด์ผ่าน definer
create or replace function purge_expired_trash(retain_days int default 7)
returns int
language plpgsql
as $$
declare
  cutoff timestamptz := now() - make_interval(days => retain_days);
  n int := 0;
  hit int;
begin
  delete from content_posts    where deleted_at is not null and deleted_at < cutoff;
  get diagnostics hit = row_count; n := n + hit;
  delete from graphic_requests where deleted_at is not null and deleted_at < cutoff;
  get diagnostics hit = row_count; n := n + hit;
  delete from tasks            where deleted_at is not null and deleted_at < cutoff;
  get diagnostics hit = row_count; n := n + hit;
  -- campaigns ไปท้ายสุด เพราะอีกสามตารางอ้าง campaign_id ถึงมัน
  delete from campaigns        where deleted_at is not null and deleted_at < cutoff;
  get diagnostics hit = row_count; n := n + hit;
  return n;
end;
$$;

grant execute on function purge_expired_trash(int) to authenticated;
