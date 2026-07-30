-- Creative may not start work on a campaign the CMO has not approved.
--
-- The team's flow is: Marketing briefs → CMO approves → work reaches Creative.
-- The middle step existed only as a convention, and it had already leaked: on
-- 2026-07-30 there were 12 graphic requests and 11 content posts under
-- campaigns still in Draft or Waiting for Approval. Creative could accept and
-- bill hours against work that was not signed off, and that a rejection or a
-- budget change would throw away.
--
-- The gate is on STARTING, not on planning. Raising a brief against an
-- unapproved campaign stays allowed — that is how a campaign becomes ready to
-- be approved. What waits is `acceptedAt`, the moment someone commits time.
--
-- Blocked statuses are the planning set, not an allow list of running ones:
-- planning states are a known closed set, while running states are open-ended
-- (Active, In Progress, Paused, Completed, …). Defaulting to "blocked" would
-- let a newly added status freeze the whole Creative queue, which is worse than
-- the behaviour this replaces. Mirrors campaignReleasedForWork() in
-- lib/data/campaigns.ts — change both together.
--
-- Idempotent. Rollback: graphic_accept_needs_campaign_approval_rollback.sql

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

drop trigger if exists graphic_accept_guard_trg on public.graphic_requests;
create trigger graphic_accept_guard_trg
  before update on public.graphic_requests
  for each row execute function public.graphic_accept_guard();

commit;
