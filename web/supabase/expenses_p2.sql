-- ═══════════════════════════════════════════════════════════════════════
-- Expenses P2 — voucher follows the reimbursement type
-- Paste into Supabase → SQL Editor → Run. Safe to re-run (idempotent).
--
-- Adds to expenses (Spending Log): the reimbursement type chosen on the
-- expense request (Petty Cash / Payment Voucher) so the printable voucher
-- can pick its header automatically, and the actual WHT amount so the
-- voucher prints real tax figures instead of a blanket 3% / 7%.
-- ═══════════════════════════════════════════════════════════════════════

alter table expenses add column if not exists reimburse_type text;
alter table expenses add column if not exists wht            numeric default 0;

-- ✅ Done.
