-- Rollback of graphic_accept_no_campaign.sql: restore the guard that refuses
-- to accept a request with no campaign.

begin;

create or replace function public.graphic_accept_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  cstatus text;
begin
  -- Only interested in a request BECOMING accepted.
  if coalesce(new.data->>'acceptedAt','') = ''
     or coalesce(new.data->>'acceptedAt','') = coalesce(old.data->>'acceptedAt','') then
    return new;
  end if;

  -- Service role / migrations run without an end-user JWT.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  select c.status into cstatus
  from public.campaigns c
  where c.id = new.campaign_id;

  -- Unknown campaign: treat as not cleared. A request whose campaign cannot be
  -- resolved must not behave as though it were approved.
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
