-- ═══════════════════════════════════════════════════════════════════════
-- Expenses P1 — approval flow upgrade
-- Paste into Supabase → SQL Editor → Run. Safe to re-run (idempotent).
--
-- Adds to expense_requests: who asked (requester), what for (vendor,
-- reimburse_type, vat, wht), a stable REQ reference linking the approval-queue
-- card, timestamps for waiting-time display, and a reject reason.
-- Adds created_at to expenses so the Spending Log can show when a paid/unpaid
-- row was created.
-- ═══════════════════════════════════════════════════════════════════════

alter table expense_requests add column if not exists ref            text;
alter table expense_requests add column if not exists requester      text;
alter table expense_requests add column if not exists vendor         text;
alter table expense_requests add column if not exists reimburse_type text;
alter table expense_requests add column if not exists vat            numeric default 0;
alter table expense_requests add column if not exists wht            numeric default 0;
alter table expense_requests add column if not exists reject_reason  text;
alter table expense_requests add column if not exists created_at     timestamptz default now();
alter table expense_requests add column if not exists approved_at    timestamptz;

alter table expenses add column if not exists created_at timestamptz default now();

-- ✅ Done.
