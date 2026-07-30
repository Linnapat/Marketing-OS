-- security_p13 — Mark Paid belongs to the Co-ordinator.
--
-- The last rule from the 2026-07-16 set that had never reached the database or
-- even the UI: moving a Spending Log row Unpaid → Paid is the Co-ordinator's
-- job, because they are the one who actually pays it. Until now the button
-- rendered for everyone who could open the Spending Log, and `expenses` UPDATE
-- asks only for Finance >= Edit — so anyone with Finance=Edit could declare
-- money paid that had not left the account. Reconciliation reads that column.
--
-- RLS cannot express "this particular status transition", so the rule is a
-- trigger. Everything else about updating an expense row is unchanged: the
-- Finance >= Edit + brand_visible() policy from security_p11/p12 still applies
-- underneath, and this narrows one transition on top of it.
--
-- The CMO (app_role = 'admin') keeps an override. Every other guard in this
-- schema exempts admin — has_module(), brand_visible(), members_guard() — and
-- with exactly one Co-ordinator on the team, making this the single place an
-- admin cannot act would strand every unpaid row whenever they are on leave.
-- Confirmed with the CMO 2026-07-30 that the approver stays a single person;
-- the same reasoning says the payer needs a fallback.
--
-- Idempotent. Rollback: security_p13_mark_paid_rollback.sql

begin;

create or replace function public.expenses_paid_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- Only interested in a row becoming Paid; every other edit falls through to
  -- the ordinary Finance >= Edit policy.
  if coalesce(new.status,'') is not distinct from coalesce(old.status,'')
     or coalesce(new.status,'') <> 'Paid' then
    return new;
  end if;

  -- Service role / migrations run without an end-user JWT.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if app_role() = 'admin' or coalesce(member_role(),'') = 'Co-ordinator' then
    return new;
  end if;

  raise exception 'เฉพาะ Co-ordinator เท่านั้นที่บันทึกรายการเป็น Paid ได้'
    using errcode = '42501';
end; $function$;

drop trigger if exists expenses_paid_guard_trg on public.expenses;
create trigger expenses_paid_guard_trg
  before update on public.expenses
  for each row execute function public.expenses_paid_guard();

commit;
