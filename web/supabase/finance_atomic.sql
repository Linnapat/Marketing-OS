-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — Atomic expense approve/reject (P2-2)
--
-- Replaces the client-side multi-table write sequence in lib/db/finance.ts with
-- one transactional function each. A Postgres function runs in a single
-- transaction, so the request-status change, the spending-log insert, and the
-- linked request-card update now commit or roll back together — no more partial
-- states if a later step fails.
--
-- SECURITY INVOKER: the function runs as the calling user, so the existing RLS
-- on expense_requests / expenses / requests still applies (staff/admin only).
--
-- Apply in Supabase → SQL Editor. Safe to re-run. After it's live, the code in
-- lib/db/finance.ts is switched to call these via db.rpc(...) (separate deploy).
-- Notifications and the audit-log write stay on the client (they hit external
-- LINE/email and capture the signed-in actor), fired only after ok = true.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.approve_expense_request(p_id bigint, p_approved numeric)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r record; v_exp_id bigint;
begin
  -- Conditional claim: only a still-"Waiting Approval" row, atomically, so a
  -- double-click or a second tab can't approve (and book the spend) twice.
  update public.expense_requests
     set status = 'Approved', approved = p_approved, approved_at = now()
   where id = p_id and status = 'Waiting Approval'
  returning * into r;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_processed');
  end if;

  -- Book the approved spend into the Spending Log as Unpaid.
  insert into public.expenses (vendor, category, brand, amount, vat, date, status, reimburse_type, wht)
  values (coalesce(nullif(r.vendor, ''), r.category), r.category, r.brand, p_approved,
          coalesce(r.vat, 0), to_char(now() at time zone 'Asia/Bangkok', 'FMMon FMDD'),
          'Unpaid', r.reimburse_type, coalesce(r.wht, 0))
  returning id into v_exp_id;

  -- Move the linked queue card to Approved.
  if r.ref is not null then
    update public.requests set stage = 'Approved' where id = r.ref;
  end if;

  return jsonb_build_object('ok', true, 'expense_id', v_exp_id, 'ref', r.ref,
                            'category', r.category, 'brand', r.brand, 'campaign', r.campaign,
                            'requested', r.requested, 'requester', r.requester);
end; $$;

create or replace function public.reject_expense_request(p_id bigint, p_reason text, p_by text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r record; v_hist jsonb;
begin
  update public.expense_requests
     set status = 'Rejected', reject_reason = p_reason
   where id = p_id and status = 'Waiting Approval'
  returning * into r;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_processed');
  end if;

  -- Send the card back to Revision and APPEND to the feedback history.
  if r.ref is not null then
    select coalesce(feedback, '[]'::jsonb) into v_hist from public.requests where id = r.ref;
    update public.requests
       set stage = 'Revision',
           feedback = v_hist || jsonb_build_object('stage', 'Revision', 'reason', p_reason, 'by', p_by, 'at', now())
     where id = r.ref;
  end if;

  return jsonb_build_object('ok', true, 'ref', r.ref, 'category', r.category, 'requester', r.requester);
end; $$;

grant execute on function public.approve_expense_request(bigint, numeric) to authenticated;
grant execute on function public.reject_expense_request(bigint, text, text) to authenticated;
