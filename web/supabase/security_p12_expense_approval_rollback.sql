-- Rollback for security_p12_expense_approval.sql — restores the pre-audit state.
--
-- Use this only to unblock production. It puts back the holes the audit found:
-- Co-ordinator/Marketing Manager able to approve expense requests, expense
-- requests readable across brands, forgeable audit actors, and app_role()
-- falling open to 'staff'. Prefer fixing forward.

begin;

drop policy if exists staff_read   on public.expense_requests;
drop policy if exists staff_write  on public.expense_requests;
drop policy if exists staff_update on public.expense_requests;
drop policy if exists staff_delete on public.expense_requests;

create policy staff_read on public.expense_requests for select
using (auth.role()='authenticated' and app_role() = any (array['admin','staff'])
       and has_module('Finance','View'));

create policy staff_write on public.expense_requests for insert
with check (auth.role()='authenticated' and app_role() = any (array['admin','staff'])
            and has_module('Finance','View'));

create policy staff_update on public.expense_requests for update
using (auth.role()='authenticated' and app_role() = any (array['admin','staff'])
       and has_module('Finance','View'))
with check (auth.role()='authenticated' and app_role() = any (array['admin','staff'])
            and has_module('Finance','View'));

create policy staff_delete on public.expense_requests for delete
using (auth.role()='authenticated' and app_role() = any (array['admin','staff'])
       and has_module('Finance','Edit'));

create or replace function public.approve_expense_request(p_id bigint, p_approved numeric)
returns jsonb language plpgsql set search_path to 'public' as $function$
declare r record; v_exp_id bigint;
begin
  update public.expense_requests set status='Approved', approved=p_approved, approved_at=now()
   where id=p_id and status='Waiting Approval' returning * into r;
  if not found then return jsonb_build_object('ok',false,'reason','already_processed'); end if;
  insert into public.expenses (vendor,category,brand,amount,vat,date,status,reimburse_type,wht)
  values (coalesce(nullif(r.vendor,''),r.category), r.category, r.brand, p_approved,
          coalesce(r.vat,0), to_char(now() at time zone 'Asia/Bangkok','FMMon FMDD'),
          'Unpaid', r.reimburse_type, coalesce(r.wht,0)) returning id into v_exp_id;
  if r.ref is not null then update public.requests set stage='Approved' where id=r.ref; end if;
  return jsonb_build_object('ok',true,'expense_id',v_exp_id,'ref',r.ref,'category',r.category,
    'brand',r.brand,'campaign',r.campaign,'requested',r.requested,'requester',r.requester);
end; $function$;

create or replace function public.reject_expense_request(p_id bigint, p_reason text, p_by text)
returns jsonb language plpgsql set search_path to 'public' as $function$
declare r record; v_hist jsonb;
begin
  update public.expense_requests set status='Rejected', reject_reason=p_reason
   where id=p_id and status='Waiting Approval' returning * into r;
  if not found then return jsonb_build_object('ok',false,'reason','already_processed'); end if;
  if r.ref is not null then
    select coalesce(feedback,'[]'::jsonb) into v_hist from public.requests where id=r.ref;
    update public.requests set stage='Revision',
      feedback = v_hist || jsonb_build_object('stage','Revision','reason',p_reason,'by',p_by,'at',now())
     where id=r.ref;
  end if;
  return jsonb_build_object('ok',true,'ref',r.ref,'category',r.category,'requester',r.requester);
end; $function$;

alter table public.audit_log alter column actor_email drop default;
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert
with check (auth.role()='authenticated' and app_role() = any (array['admin','staff']));

create or replace function public.app_role()
returns text language sql stable set search_path to 'public' as $function$
  select coalesce(nullif(auth.jwt() ->> 'app_role', ''), 'staff');
$function$;

commit;
