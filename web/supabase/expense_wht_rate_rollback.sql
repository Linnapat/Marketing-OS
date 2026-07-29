-- Rollback of expense_wht_rate.sql
-- The withheld AMOUNTS stay in `wht`; only the recorded rate is lost, and
-- vouchers fall back to reconstructing it from the amount.
alter table expense_requests drop column if exists wht_rate;
alter table expenses         drop column if exists wht_rate;
