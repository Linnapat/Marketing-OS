-- Rollback for security_p13_mark_paid.sql.
-- Removes the Co-ordinator restriction on Unpaid → Paid; afterwards anyone with
-- Finance >= Edit can mark a row paid again.

begin;
drop trigger if exists expenses_paid_guard_trg on public.expenses;
drop function if exists public.expenses_paid_guard();
commit;
