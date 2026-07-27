-- security_p10 — ให้ Agency Portal ใช้งานได้จริง โดยเห็นเฉพาะงานของตัวเอง
--
-- ปัญหา: custom_access_token_hook stamp app_role = 'agency' ให้สมาชิกที่
-- brand_access = 'External only' หรือ role มีคำว่า agency แต่ RLS ทุกตาราง
-- เปิดให้แค่ ['admin','staff'] ยกเว้น agency_tasks ตารางเดียว ผลคือ designer
-- outsource login เข้ามาแล้ว:
--   1) อ่าน graphic_requests ไม่ได้เลย → Agency Portal (ที่ดึงงานจาก
--      fetchGraphics) ว่างเปล่า เห็นแค่ manual task ที่พิมพ์เพิ่มเอง
--   2) อ่านแถว members ของตัวเองไม่ได้ → client resolve member = null →
--      memberRole(null) คืน "Content Creator" ไม่ใช่ "Agency (External)"
--      AppShell เลยไม่ confine เขาไป /agency และตัวกรอง
--      isVisibleToAgencyUser() ที่เทียบ designer กับ "ชื่อ" ของสมาชิก
--      ก็ตัดงานทิ้งหมดเพราะไม่รู้ชื่อตัวเอง
--
-- หลักการของแพตช์นี้:
--   1) agency อ่าน/แก้ graphic_requests ได้เฉพาะแถวที่ designer = ตัวเอง
--      (คอลัมน์ designer เก็บ "ชื่อ" ไม่ใช่อีเมล — ค่าจริงในตารางคือ
--      Jeeno / Pichayaporn / Four / Unassigned) จับคู่ผ่าน members ด้วยอีเมล
--      ใน JWT · fail-closed: อ่านชื่อไม่ออก = ไม่เห็นอะไรเลย
--   2) agency อ่านแถว members ของ "ตัวเองแถวเดียว" ได้ (ไม่เห็นทีมงานคนอื่น)
--   3) การให้สิทธิ์ UPDATE เปิดช่องใหม่ที่ก่อนหน้านี้ไม่มี: เขียนทับ
--      data jsonb ได้ทั้งก้อน และ fetchGraphics อ่าน "จาก blob เท่านั้น"
--      (คอลัมน์เป็นแค่ mirror ไว้ query) แปลว่าถ้ากั้นแค่คอลัมน์ stage
--      ยังตั้ง data->>'stage' = 'Approved' เองได้ → trigger ด้านล่างกั้น
--      ที่ blob ด้วย ตรงกับกติกาที่ฝั่งแอปเขียนไว้แล้วใน
--      lib/data/agency.ts: AGENCY_EDITABLE_STATUSES ("Approved" internal-only)
--
-- ไม่แตะ: service role, auth hook, policy ของ staff/admin เดิมทั้งหมด
-- rollback: security_p10_agency_portal_rollback.sql

set search_path = public;

-- ── helpers ───────────────────────────────────────────────────────────────

-- ชื่อในตาราง members ของคนที่ login อยู่ security definer เพราะ agency
-- อ่าน members ทั้งตารางไม่ได้ (และไม่ควรได้) แต่ policy ต้องใช้ชื่อตัวเอง
create or replace function public.jwt_member_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.name from members m where lower(m.email) = jwt_email() limit 1
$$;

comment on function public.jwt_member_name() is
  'ชื่อ (members.name) ของผู้ใช้ที่ login — ใช้จับคู่คอลัมน์ที่เก็บชื่อ เช่น graphic_requests.designer';

-- งานชิ้นนี้เป็นของคนที่ login อยู่หรือไม่ รับได้ทั้งชื่อและอีเมล เผื่อแถวเก่า
-- ที่เคยกรอก designer เป็นอีเมล · "Unassigned" ไม่นับเป็นของใครทั้งนั้น
create or replace function public.owns_designer_slot(designer_name text)
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(btrim(designer_name), '') is not null
    and lower(btrim(designer_name)) <> 'unassigned'
    and (
      lower(btrim(designer_name)) = lower(btrim(jwt_member_name()))
      or lower(btrim(designer_name)) = jwt_email()
    ),
    false
  )
$$;

-- ── 1) graphic_requests: agency เห็น/แก้เฉพาะงานตัวเอง ────────────────────

drop policy if exists agency_own_graphics_read on graphic_requests;
create policy agency_own_graphics_read on graphic_requests
for select
using (
  auth.role() = 'authenticated'
  and app_role() = 'agency'
  and owns_designer_slot(designer)
);

-- with check ใช้เงื่อนไขเดียวกัน = ห้ามโยนงานออกจากมือตัวเอง หรือดึงงานคนอื่นมา
drop policy if exists agency_own_graphics_update on graphic_requests;
create policy agency_own_graphics_update on graphic_requests
for update
using (
  auth.role() = 'authenticated'
  and app_role() = 'agency'
  and owns_designer_slot(designer)
)
with check (
  auth.role() = 'authenticated'
  and app_role() = 'agency'
  and owns_designer_slot(designer)
);

-- จงใจไม่ให้ INSERT / DELETE: คำขอกราฟฟิกเกิดจากฝั่งทีมเท่านั้น

-- ── 2) members: agency อ่านแถวตัวเองได้แถวเดียว ───────────────────────────

drop policy if exists members_agency_self_read on members;
create policy members_agency_self_read on members
for select
using (
  auth.role() = 'authenticated'
  and app_role() = 'agency'
  and lower(email) = jwt_email()
);

-- ── 3) trigger: agency แก้ได้เฉพาะสิ่งที่ควรแก้ ───────────────────────────

create or replace function public.graphic_agency_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_del jsonb;
  new_del jsonb;
  i int;
begin
  -- staff/admin/service role ไม่ถูกแตะ
  if app_role() <> 'agency' then
    return new;
  end if;

  -- การมอบหมายงานและข้อมูลหัวเรื่องเป็นของฝั่งทีม
  if coalesce(new.designer, '')  is distinct from coalesce(old.designer, '')
  or coalesce(new.requester, '') is distinct from coalesce(old.requester, '')
  or coalesce(new.approver, '')  is distinct from coalesce(old.approver, '')
  or coalesce(new.brand, '')     is distinct from coalesce(old.brand, '')
  or coalesce(new.campaign, '')  is distinct from coalesce(old.campaign, '') then
    raise exception 'agency: reassigning a graphic request is not allowed';
  end if;

  -- "Approved" / "Delivered" เป็นสถานะภายใน (AGENCY_EDITABLE_STATUSES)
  if coalesce(new.stage, '') in ('Approved', 'Delivered')
  or coalesce(new.data ->> 'stage', '') in ('Approved', 'Delivered') then
    raise exception 'agency: approving or delivering a request is not allowed';
  end if;

  -- ...และอนุมัติ deliverable ของตัวเองใน blob ก็ไม่ได้เช่นกัน
  old_del := case when jsonb_typeof(old.data -> 'deliverables') = 'array'
                  then old.data -> 'deliverables' else '[]'::jsonb end;
  new_del := case when jsonb_typeof(new.data -> 'deliverables') = 'array'
                  then new.data -> 'deliverables' else '[]'::jsonb end;

  -- จับคู่ด้วย platform::size ไม่ใช่ลำดับ index เพราะสลับ/ตัดแถวได้
  for i in 0 .. greatest(jsonb_array_length(new_del) - 1, -1) loop
    if (new_del -> i ->> 'status') = 'Approved'
       and not exists (
         select 1
         from jsonb_array_elements(old_del) o
         where coalesce(o ->> 'platform', '') = coalesce(new_del -> i ->> 'platform', '')
           and coalesce(o ->> 'size', '')     = coalesce(new_del -> i ->> 'size', '')
           and (o ->> 'status') = 'Approved'
       ) then
      raise exception 'agency: approving your own deliverable is not allowed';
    end if;
  end loop;

  -- sign-off บรีฟอยู่ฝั่ง content เหมือนเดิม
  if coalesce(new.brief_complete, false) is distinct from coalesce(old.brief_complete, false)
  or coalesce(new.data ->> 'briefApprovedBy', '') is distinct from coalesce(old.data ->> 'briefApprovedBy', '') then
    raise exception 'agency: signing off a brief is not allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists graphic_agency_guard on graphic_requests;
create trigger graphic_agency_guard
before update on graphic_requests
for each row
execute function public.graphic_agency_guard();
