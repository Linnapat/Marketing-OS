-- security_p12 — the expense-approval rules, moved from the UI into the database.
--
-- The audit (2026-07-30) found that "เฉพาะ CMO อนุมัติเบิกงบ" existed only in the
-- UI and in the docs. At the database level:
--
--   * approve_expense_request() was not SECURITY DEFINER and carried no role
--     check, so it ran with the caller's rights and whatever RLS allowed;
--   * expense_requests UPDATE was gated on Finance >= *View* (expenses used
--     Edit), so a Marketing Manager / BGL could PATCH status='Approved'
--     straight through PostgREST and a Co-ordinator (Finance=Edit) could drive
--     the whole RPC — approving any request, including their own;
--   * expense_requests had no brand_visible() at all, so 15 of 32 rows were
--     readable by a manager scoped to two other brands.
--
-- Business rule confirmed by the CMO (2026-07-30): **everyone on the team may
-- SUBMIT an expense request; only the CMO approves.** That splits what used to
-- be one "Finance" level into two different things, so the policies below stop
-- gating submission on the Finance module and gate it on row ownership instead
-- (requester = jwt_member_name(), the same trick owns_designer_slot already
-- uses). Reading other people's requests still needs Finance >= View.
--
-- Idempotent. Rollback: security_p12_expense_approval_rollback.sql

begin;

-- ── 1. expense_requests: submit = anyone, read = own or Finance≥View, ────────
--        approve = Finance≥Approve (CMO), all brand-scoped.

drop policy if exists staff_read   on public.expense_requests;
drop policy if exists staff_write  on public.expense_requests;
drop policy if exists staff_update on public.expense_requests;
drop policy if exists staff_delete on public.expense_requests;

-- SELECT — your own requests are always visible to you (you must be able to
-- follow what you submitted); everything else needs the Finance module and
-- stays inside your brand scope.
create policy staff_read on public.expense_requests for select
using (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and (
    requester = jwt_member_name()
    or (has_module('Finance','View') and brand_visible(brand))
  )
);

-- INSERT — every internal member may submit, but only as themselves and only
-- as a pending request. Without the status/approved guards a submitter could
-- insert a row that is already 'Approved' with an amount of their choosing,
-- which is the same hole the RPC check closes from the other side.
create policy staff_write on public.expense_requests for insert
with check (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and brand_visible(brand)
  and requester = jwt_member_name()
  and coalesce(status,'') = 'Waiting Approval'
  and coalesce(approved, 0) = 0
);

-- UPDATE — deciding a request is an approval act: Finance >= Approve, which
-- today is the CMO (and the unused "Finance"/"Admin / CMO" matrix rows).
-- Co-ordinator (Edit) and Marketing Manager / BGL (View) are now excluded.
create policy staff_update on public.expense_requests for update
using (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and has_module('Finance','Approve')
  and brand_visible(brand)
)
with check (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and has_module('Finance','Approve')
  and brand_visible(brand)
);

create policy staff_delete on public.expense_requests for delete
using (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and has_module('Finance','Edit')
  and brand_visible(brand)
);

-- ── 2. approve/reject: the rule lives in the function, not in the caller ─────
-- Both stay SECURITY INVOKER so RLS still applies underneath; the explicit
-- check is what makes the rule true even if a policy is loosened later.

create or replace function public.approve_expense_request(p_id bigint, p_approved numeric)
returns jsonb language plpgsql set search_path to 'public' as $function$
declare r record; v_exp_id bigint;
begin
  if not (app_role() = 'admin' or coalesce(member_role(),'') = 'CMO') then
    raise exception 'เฉพาะ CMO เท่านั้นที่อนุมัติคำขอเบิกงบได้' using errcode = '42501';
  end if;

  update public.expense_requests set status='Approved', approved=p_approved, approved_at=now()
   where id=p_id and status='Waiting Approval' returning * into r;
  if not found then return jsonb_build_object('ok',false,'reason','already_processed'); end if;

  insert into public.expenses (vendor,category,brand,amount,vat,date,status,reimburse_type,wht)
  values (coalesce(nullif(r.vendor,''),r.category), r.category, r.brand, p_approved,
          coalesce(r.vat,0), to_char(now() at time zone 'Asia/Bangkok','FMMon FMDD'),
          'Unpaid', r.reimburse_type, coalesce(r.wht,0)) returning id into v_exp_id;
  if r.ref is not null then update public.requests set stage='Approved' where id=r.ref; end if;

  -- Audit inside the transaction: a decision that books money must not be able
  -- to succeed while its trail silently fails (the client-side logAudit call is
  -- best-effort and is skipped entirely by anyone calling this RPC directly).
  insert into public.audit_log (action, module, before_text, after_text, actor_name, meta)
  values ('อนุมัติคำขอเบิกงบ' || coalesce(' ' || r.ref, '') || ' · ' || coalesce(r.category,''),
          'Finance', 'ขอ ' || coalesce(r.requested,0)::text, 'อนุมัติ ' || p_approved::text,
          jwt_member_name(),
          jsonb_build_object('ref', r.ref, 'brand', r.brand, 'campaign', r.campaign,
                             'requester', r.requester, 'expense_id', v_exp_id, 'source', 'rpc'));

  return jsonb_build_object('ok',true,'expense_id',v_exp_id,'ref',r.ref,'category',r.category,
    'brand',r.brand,'campaign',r.campaign,'requested',r.requested,'requester',r.requester);
end; $function$;

create or replace function public.reject_expense_request(p_id bigint, p_reason text, p_by text)
returns jsonb language plpgsql set search_path to 'public' as $function$
declare r record; v_hist jsonb;
begin
  if not (app_role() = 'admin' or coalesce(member_role(),'') = 'CMO') then
    raise exception 'เฉพาะ CMO เท่านั้นที่ตีกลับคำขอเบิกงบได้' using errcode = '42501';
  end if;

  update public.expense_requests set status='Rejected', reject_reason=p_reason
   where id=p_id and status='Waiting Approval' returning * into r;
  if not found then return jsonb_build_object('ok',false,'reason','already_processed'); end if;
  if r.ref is not null then
    select coalesce(feedback,'[]'::jsonb) into v_hist from public.requests where id=r.ref;
    update public.requests set stage='Revision',
      feedback = v_hist || jsonb_build_object('stage','Revision','reason',p_reason,'by',p_by,'at',now())
     where id=r.ref;
  end if;

  insert into public.audit_log (action, module, before_text, after_text, actor_name, meta)
  values ('ตีกลับคำขอเบิกงบ' || coalesce(' ' || r.ref, '') || ' · ' || coalesce(r.category,''),
          'Finance', 'Waiting Approval', 'Rejected', jwt_member_name(),
          jsonb_build_object('ref', r.ref, 'reason', p_reason, 'requester', r.requester, 'source', 'rpc'));

  return jsonb_build_object('ok',true,'ref',r.ref,'category',r.category,'requester',r.requester);
end; $function$;

-- ── 3. audit_log: the actor is whoever the token says, not whoever asked ─────
-- actor_email had no default and the INSERT policy never compared it to the
-- JWT, so any staff could write an entry naming somebody else.

alter table public.audit_log
  alter column actor_email set default (auth.jwt() ->> 'email');

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert
with check (
  auth.role() = 'authenticated'
  and app_role() = any (array['admin','staff'])
  and (actor_email is null or lower(actor_email) = jwt_email())
);

-- ── 4. app_role(): no claim is not a reason to trust someone ────────────────
-- Was: coalesce(..., 'staff') — a token minted without the custom access token
-- hook (hook disabled, or issued before it was enabled) resolved to full staff
-- access. security_p3 §2 proposed this change and it was deliberately deferred;
-- the audit re-raised it. Applied off-hours (CMO, 2026-07-30) because every
-- token that has not refreshed loses access until it does (~1 hour).
create or replace function public.app_role()
returns text language sql stable set search_path to 'public' as $function$
  select coalesce(nullif(auth.jwt() ->> 'app_role', ''), 'none');
$function$;

-- ── 5. pin search_path on the one function the advisor still flags ──────────
create or replace function public.owns_designer_slot(designer_name text)
returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce(
    nullif(btrim(designer_name), '') is not null
    and lower(btrim(designer_name)) <> 'unassigned'
    and (
      lower(btrim(designer_name)) = lower(btrim(jwt_member_name()))
      or lower(btrim(designer_name)) = jwt_email()
    ),
    false
  )
$function$;

commit;
