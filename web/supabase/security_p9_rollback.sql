-- rollback ของ security_p9 — คืนสภาพก่อน brand-scope RLS ทั้งหมด
-- (staff_rw ALL แบบเดิมทุกตาราง + ถอด trigger/functions)

set search_path = public;

drop trigger if exists campaigns_status_guard on campaigns;
drop function if exists campaigns_status_guard();

do $$
declare t text;
begin
  foreach t in array array['campaigns','graphic_requests','content_posts','requests','expenses','campaign_results'] loop
    execute format('drop policy if exists staff_read on %I', t);
    execute format('drop policy if exists staff_insert on %I', t);
    execute format('drop policy if exists staff_write on %I', t);
    execute format('drop policy if exists staff_update on %I', t);
    execute format('drop policy if exists staff_delete on %I', t);
    execute format('drop policy if exists admin_delete on %I', t);
    execute format(
      'create policy staff_rw on %I for all using (auth.role() = ''authenticated'' and app_role() = any(array[''admin'',''staff''])) with check (auth.role() = ''authenticated'' and app_role() = any(array[''admin'',''staff'']))', t);
  end loop;
end $$;

drop function if exists brand_visible(text);
drop function if exists member_brand_access();
drop function if exists member_role();
drop function if exists norm_txt(text);
drop function if exists jwt_email();
