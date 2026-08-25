-- หา "งานซ้ำ" ที่เกิดจากการอนุมัติแคมเปญทับงานที่บรีฟด้วยมือไว้ก่อน
--
-- ที่มา: ใบงานที่ raise เองผ่าน "+ Send Brief" จะสร้างโพสต์ของตัวเองขึ้นมา
-- โพสต์นั้นไม่มี sourceContentItemId (เพราะไม่ได้เกิดจาก content item ในบรีฟ)
-- พอแคมเปญถูกอนุมัติทีหลัง fan-out มองไม่เห็นว่ามีงานอยู่แล้ว จึงสร้างซ้ำอีกชุด
--
-- แยกสองฝั่งด้วยชื่อ:
--   ใบที่ทำเอง      = ชื่อโพสต์เปล่า ๆ            เช่น "TO10_YOUR DREAM, TO ISE JINGU"
--   ใบที่ fan-out ทำ = ชื่อโพสต์ + " — " + type   เช่น "TO10_YOUR DREAM, TO ISE JINGU — Reel"
--
-- ทั้งสองคำสั่งเป็น SELECT อย่างเดียว ไม่แก้ข้อมูล — รันดูก่อนแล้วค่อยตัดสินใจ

-- ── 1. ใบงานซ้ำ (Graphic Request) ────────────────────────────────────────────
select
  dup.campaign                        as campaign,
  keep.id                             as keep_id,
  keep.data->>'code'                  as keep_code,
  keep.title                          as keep_title,
  keep.stage                          as keep_stage,
  keep.designer                       as keep_designer,
  dup.id                              as dup_id,
  dup.data->>'code'                   as dup_code,
  dup.title                           as dup_title,
  dup.stage                           as dup_stage,
  dup.designer                        as dup_designer,
  -- ปลอดภัยที่จะลบใบ dup ไหม: ยังไม่มีใครแตะเลยหรือเปล่า
  (dup.stage = 'New Request'
     and coalesce(dup.designer, 'Unassigned') = 'Unassigned'
     and not exists (
       select 1
       from jsonb_array_elements(coalesce(dup.data->'deliverables', '[]'::jsonb)) d
       where d->>'status' is distinct from 'Not submitted'
     ))                                as dup_untouched
from graphic_requests dup
join graphic_requests keep
  on  keep.campaign_id = dup.campaign_id
  and keep.id <> dup.id
  and dup.title = keep.title || ' — ' || dup.type
  -- ต้องเทียบ type ด้วย ไม่งั้นแคมเปญที่มีสองใบชื่อเดียวกัน (Reel กับ Artwork)
  -- จะ join ไขว้กันเป็น 4 แถวจาก 2 คู่ — เจอตอนรันจริง 25 ส.ค.
  and keep.type = dup.type
where dup.deleted_at is null
  and keep.deleted_at is null
order by dup.campaign, keep.title;

-- ── 2. โพสต์ซ้ำ (Content Plan) ───────────────────────────────────────────────
-- ฝั่งโพสต์ชื่อเหมือนกันเป๊ะทั้งคู่ แยกไม่ได้ด้วยชื่อ — ดูที่ sourceContentItemId
-- แทน: ตัวที่ fan-out สร้างจะมีค่านี้ ตัวที่ทำเองจะว่าง
select
  p.campaign,
  p.data->>'id'                    as post_id,
  p.data->>'code'                  as code,
  p.title,
  p.status,
  p.data->>'sourceContentItemId'   as source_item,
  case when p.data->>'sourceContentItemId' is null
       then 'ทำเอง (น่าจะเป็นตัวจริง)'
       else 'fan-out สร้าง' end    as origin,
  p.created_at
from content_posts p
join (
  select campaign_id, lower(btrim(title)) as t
  from content_posts
  where deleted_at is null
  group by 1, 2
  having count(*) > 1
) d
  on  d.campaign_id = p.campaign_id
  and lower(btrim(p.title)) = d.t
where p.deleted_at is null
order by p.campaign, p.title, p.created_at;
