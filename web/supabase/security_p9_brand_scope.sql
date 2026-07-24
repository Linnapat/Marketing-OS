-- security_p9 — RLS ระดับ database: brand scope + CMO-only privileged status
--
-- ปิดช่องที่ live RBAC testing (18 ก.ค. 2026) พิสูจน์ว่ามีคนเดินชนจริง:
-- ทุก gate ก่อนหน้าเป็น UI เท่านั้น — staff ที่ยิง API ตรงยังอ่าน/เขียนแคมเปญ
-- และข้อมูลเงินของแบรนด์นอกสิทธิ์ได้ทั้งหมด
--
-- หลักการ:
--   1) การอ่าน/เขียนตารางที่ผูกแบรนด์ (campaigns, graphic_requests,
--      content_posts, requests, expenses, campaign_results) ต้องผ่าน
--      brand_visible() ซึ่ง replicate ตัว parse brand_access ของ client
--      (lib/brandVisibility.ts) — จุดต่างที่จงใจ: client ที่ scope พิมพ์ผิด
--      จน match อะไรไม่ได้จะ "เห็นทุกแบรนด์" (fail-open) แต่ฝั่ง DB เลือก
--      fail-CLOSED: scope ที่อ่านไม่ออก = ไม่เห็นอะไรเลย ปลอดภัยกว่า
--      (ตรวจข้อมูลจริงก่อน apply แล้ว: สมาชิกปัจจุบันทุกคนเป็น "All brands")
--   2) การย้ายสถานะแคมเปญเข้า/ออกกลุ่มอนุมัติ (Approved / In Progress /
--      Completed) ทำได้เฉพาะ CMO/admin — ยกเว้นขาออกไป "Waiting for
--      Approval" ซึ่งเปิดให้ staff เพราะเป็นกลไก "แก้แล้วส่งกลับให้ CMO
--      อนุมัติใหม่" (feat/edit-reapproval-diff)
--   3) service role และ auth hook ไม่ถูกแตะ (bypass RLS / policy เดิม)
--
-- rollback: security_p9_rollback.sql

set search_path = public;

-- ── helper functions ──────────────────────────────────────────────────────

create or replace function jwt_email() returns text
language sql stable set search_path = public as
$$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- อ่านแถวสมาชิกของคนที่ล็อกอิน — SECURITY DEFINER เพื่อไม่พันกับ RLS ของ
-- members เอง (และไม่ recurse)
create or replace function member_brand_access() returns text
language sql stable security definer set search_path = public as
$$ select m.brand_access from members m where lower(m.email) = jwt_email() limit 1 $$;

create or replace function member_role() returns text
language sql stable security definer set search_path = public as
$$ select m.role from members m where lower(m.email) = jwt_email() limit 1 $$;

create or replace function norm_txt(t text) returns text
language sql immutable set search_path = public as
$$ select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g') $$;

-- brand_visible(key) — สิทธิ์มองเห็นแบรนด์ของ "ผู้ใช้ที่ล็อกอินอยู่"
-- ตรรกะเดียวกับ visibleBrandsFromScope() ฝั่ง client:
--   admin เห็นหมด · ไม่มีแถวสมาชิก = ไม่เห็น · "All brands" เห็นหมด ·
--   "External only" ไม่เห็น · อื่นๆ จับคู่ชื่อแบรนด์จาก brands_config
--   (ตัดคำ " Thailand" ท้ายชื่อแบบเดียวกับ client) + alias ของแบรนด์ seed
create or replace function brand_visible(brand_key text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare
  scope text;
  nscope text;
  cfg jsonb;
  bname text;
begin
  if coalesce(auth.jwt() ->> 'app_role', 'staff') = 'admin' then
    return true;
  end if;

  scope := member_brand_access();
  if scope is null then
    return false; -- ไม่มีแถวสมาชิก (บัญชีหลุดคู่) — fail closed
  end if;
  if btrim(scope) = '' or scope ~* '^all brands$' then
    return true;
  end if;
  if scope ~* 'external only' then
    return false;
  end if;

  nscope := norm_txt(regexp_replace(scope, '^Branch\s*·\s*', '', 'i'));

  select os.value::jsonb into cfg from org_settings os where os.key = 'brands_config';
  select c ->> 'name' into bname
  from jsonb_array_elements(coalesce(cfg, '[]'::jsonb)) c
  where c ->> 'key' = brand_key
  limit 1;
  bname := regexp_replace(coalesce(bname, brand_key), '\s+Thailand$', '', 'i');

  if position(norm_txt(bname) in nscope) > 0 then
    return true;
  end if;
  -- alias ของแบรนด์ seed (ตรงกับ BRAND_ALIASES ฝั่ง client) + key ตรงตัว
  return case brand_key
    when 'teppen'   then nscope like '%teppen%'
    when 'omakase'  then nscope like '%omakase%' or nscope like '%omd%'
    when 'mainichi' then nscope like '%mainichi%'
    when 'touka'    then nscope like '%touka%'
    else position(norm_txt(brand_key) in nscope) > 0
  end;
end;
$$;

revoke all on function member_brand_access() from public;
revoke all on function member_role() from public;
grant execute on function jwt_email(), member_brand_access(), member_role(), norm_txt(text), brand_visible(text) to authenticated;

-- ── นโยบายรายตาราง: แทน staff_rw (ALL) ด้วยชุดที่ scope แบรนด์ ────────────

-- helper เงื่อนไขพื้นฐานเดิม: ล็อกอิน + เป็น staff/admin
-- (เขียนซ้ำในแต่ละ policy เพราะ policy ไม่รับ function ที่คืน SQL)

-- campaigns — อ่าน/เขียนเฉพาะแบรนด์ที่เห็น; ลบ = admin (CMO) เท่านั้น
drop policy if exists staff_rw on campaigns;
create policy staff_read on campaigns for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_insert on campaigns for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_update on campaigns for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy admin_delete on campaigns for delete
  using (auth.role() = 'authenticated' and app_role() = 'admin');

-- graphic_requests
drop policy if exists staff_rw on graphic_requests;
create policy staff_read on graphic_requests for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_write on graphic_requests for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_update on graphic_requests for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_delete on graphic_requests for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));

-- content_posts
drop policy if exists staff_rw on content_posts;
create policy staff_read on content_posts for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_write on content_posts for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_update on content_posts for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_delete on content_posts for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));

-- requests (คำขอเบิก — ที่รั่วใน Cashier)
drop policy if exists staff_rw on requests;
create policy staff_read on requests for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_write on requests for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_update on requests for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_delete on requests for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));

-- expenses (spending log)
drop policy if exists staff_rw on expenses;
create policy staff_read on expenses for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_write on expenses for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_update on expenses for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));
create policy staff_delete on expenses for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff') and brand_visible(brand));

-- campaign_results — ไม่มีคอลัมน์ brand: scope ผ่านแคมเปญแม่
drop policy if exists staff_rw on campaign_results;
create policy staff_read on campaign_results for select
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff')
         and exists (select 1 from campaigns c where c.id = campaign_id and brand_visible(c.brand)));
create policy staff_write on campaign_results for insert
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff')
              and exists (select 1 from campaigns c where c.id = campaign_id and brand_visible(c.brand)));
create policy staff_update on campaign_results for update
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff')
         and exists (select 1 from campaigns c where c.id = campaign_id and brand_visible(c.brand)))
  with check (auth.role() = 'authenticated' and app_role() in ('admin','staff')
              and exists (select 1 from campaigns c where c.id = campaign_id and brand_visible(c.brand)));
create policy staff_delete on campaign_results for delete
  using (auth.role() = 'authenticated' and app_role() in ('admin','staff')
         and exists (select 1 from campaigns c where c.id = campaign_id and brand_visible(c.brand)));

-- ── (2) สถานะแคมเปญ: เข้า/ออกกลุ่มอนุมัติ = CMO เท่านั้น ─────────────────
-- ตรวจทั้งคอลัมน์ status และสถานะใน brief blob (data->>'status') เพราะแอป
-- เขียนทั้งสองทาง ขาออกจากกลุ่มอนุมัติไป "Waiting for Approval" เปิดให้
-- staff — คือกลไกแก้แล้วส่งกลับเข้าคิว CMO

create or replace function campaigns_status_guard() returns trigger
language plpgsql security definer set search_path = public as
$$
declare
  priv text[] := array['Approved','In Progress','Completed'];
  is_cmo boolean;
begin
  -- คุมเฉพาะ session ผู้ใช้จริง — service role / งานระบบไม่เกี่ยว
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  is_cmo := coalesce(auth.jwt() ->> 'app_role', 'staff') = 'admin'
            or coalesce(member_role(), '') = 'CMO';
  if is_cmo then
    return new;
  end if;

  if (coalesce(new.status,'') <> coalesce(old.status,'') and coalesce(new.status,'') = any(priv))
     or (coalesce(new.data->>'status','') <> coalesce(old.data->>'status','') and coalesce(new.data->>'status','') = any(priv)) then
    raise exception 'เฉพาะ CMO เท่านั้นที่ย้ายแคมเปญเข้าสถานะ % ได้', coalesce(nullif(new.status, old.status), new.data->>'status')
      using errcode = '42501';
  end if;
  if (coalesce(old.status,'') = any(priv) and coalesce(new.status,'') <> coalesce(old.status,'') and coalesce(new.status,'') <> 'Waiting for Approval')
     or (coalesce(old.data->>'status','') = any(priv) and coalesce(new.data->>'status','') <> coalesce(old.data->>'status','') and coalesce(new.data->>'status','') <> 'Waiting for Approval') then
    raise exception 'แคมเปญที่อนุมัติแล้ว ออกจากสถานะเดิมได้ทางเดียวคือส่งกลับให้ CMO อนุมัติใหม่ (Waiting for Approval)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_status_guard on campaigns;
create trigger campaigns_status_guard
  before update on campaigns
  for each row execute function campaigns_status_guard();

revoke execute on function campaigns_status_guard() from public;
