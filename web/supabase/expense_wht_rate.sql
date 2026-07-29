-- Expense — the withholding RATE, not just the amount.
--
-- The form offered a single "WHT 3%" tick, so a marketing team paying 2% on
-- advertising or 5% on rent either filed it as 3% or left it off. The rate is
-- now chosen per request, and it has to be stored: the amount alone cannot say
-- what rate produced it once the base is rounded, and the printed voucher has a
-- column for the rate that was hardcoded to "3 %".
--
-- Old rows keep wht_rate = 0; lib/data/expenseTax.inferWhtRate reconstructs a
-- rate from amount ÷ base purely to label those historical vouchers.
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- rollback: expense_wht_rate_rollback.sql

alter table expense_requests add column if not exists wht_rate numeric default 0;
alter table expenses         add column if not exists wht_rate numeric default 0;
