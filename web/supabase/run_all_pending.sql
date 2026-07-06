-- ═══════════════════════════════════════════════════════════════════════
-- Marketing OS — run ALL pending migrations in one go
-- Paste this whole block into Supabase → SQL Editor → Run. Safe to re-run.
-- Combines: campaign_types.sql + approval_feedback.sql + campaign_brief.sql
--         + expenses_p1.sql
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Shared campaign types (admin-added types visible team-wide) ───────────
create table if not exists campaign_types (
  name       text primary key,
  created_at timestamptz default now()
);
alter table campaign_types enable row level security;
drop policy if exists demo_all on campaign_types;
create policy demo_all on campaign_types for all using (true) with check (true);

-- 2) Approval-queue feedback log (reject / send-back reason history) ────────
alter table requests add column if not exists feedback jsonb default '[]'::jsonb;

-- 3) Campaign Brief builder (brief blob + task link columns) ────────────────
alter table campaigns add column if not exists data jsonb;
alter table tasks     add column if not exists related_brief text;
alter table tasks     add column if not exists related_graphic_id text;
alter table tasks     add column if not exists channel text;

-- 4) Expenses P1 — approval flow (requester, vendor, tax, ref, timestamps) ──
alter table expense_requests add column if not exists ref            text;
alter table expense_requests add column if not exists requester      text;
alter table expense_requests add column if not exists vendor         text;
alter table expense_requests add column if not exists reimburse_type text;
alter table expense_requests add column if not exists vat            numeric default 0;
alter table expense_requests add column if not exists wht            numeric default 0;
alter table expense_requests add column if not exists reject_reason  text;
alter table expense_requests add column if not exists created_at     timestamptz default now();
alter table expense_requests add column if not exists approved_at    timestamptz;
alter table expenses         add column if not exists created_at     timestamptz default now();

-- ✅ Done. All migrations are idempotent — running again is harmless.
