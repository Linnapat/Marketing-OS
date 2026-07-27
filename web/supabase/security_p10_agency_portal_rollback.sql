-- rollback ของ security_p10_agency_portal.sql
--
-- กลับไปสภาพเดิม: app_role = 'agency' เข้าถึงได้เฉพาะ agency_tasks
-- (Agency Portal จะกลับไปว่างเปล่าเหมือนก่อนแพตช์)

set search_path = public;

drop trigger if exists graphic_agency_guard on graphic_requests;
drop function if exists public.graphic_agency_guard();

drop policy if exists agency_own_graphics_read on graphic_requests;
drop policy if exists agency_own_graphics_update on graphic_requests;
drop policy if exists members_agency_self_read on members;

drop function if exists public.owns_designer_slot(text);
drop function if exists public.jwt_member_name();
