-- A graphic request may now be raised without a campaign (POSM, menus,
-- one-off art). graphic_accept_needs_campaign_approval.sql refused to accept
-- any request whose campaign could not be found — including one that never had
-- a campaign — so Creative could not start such work at all.
--
-- Now: no campaign_id → nothing to wait for, accept goes through. A campaign_id
-- that points at a missing row is still refused, as before.
--
-- Idempotent. Rollback: graphic_accept_no_campaign_rollback.sql

begin;

create or replace function public.graphic_accept_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  cstatus text;
begin
  if coalesce(new.data->>'acceptedAt','') = ''
     or coalesce(new.data->>'acceptedAt','') = coalesce(old.data->>'acceptedAt','') then
    return new;
  end if;

  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  -- Request filed without a campaign: no CMO approval to wait on.
  if new.campaign_id is null then
    return new;
  end if;

  select c.status into cstatus
  from public.campaigns c
  where c.id = new.campaign_id;

  if cstatus is null then
    raise exception 'ไม่พบแคมเปญของใบงานนี้ (%) — รับงานไม่ได้', coalesce(new.campaign_id,'ไม่ระบุ')
      using errcode = '42501';
  end if;

  if cstatus in ('Draft','Planning','Ready for Review',
                 'Waiting for Approval','Waiting Approval','Need Revision','Cancelled') then
    raise exception 'แคมเปญนี้สถานะ "%" — CMO ยังไม่อนุมัติ จึงยังรับงานไม่ได้ (วางแผน/แก้บรีฟได้ตามปกติ)', cstatus
      using errcode = '42501';
  end if;

  return new;
end; $function$;

commit;
