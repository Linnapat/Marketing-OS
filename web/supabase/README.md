# Supabase — schema & migration source of truth

There is **no automatic migration runner**; migrations are plain SQL pasted into
the Supabase SQL Editor. To avoid the "which file is actually applied?" confusion
the audit flagged (P2-10), this file is the canonical order and status.

## Apply order (fresh project)

1. `schema.sql` — base tables + **demo-open** RLS (`demo_all using(true)`). Fine for
   local/dev; **do not leave these policies on a shared/production project.**
2. `schema_v2.sql`, `campaign_types.sql`, `approval_feedback.sql`,
   `campaign_brief.sql`, `expenses_p1.sql`, `expenses_p2.sql`,
   `app_settings.sql`, `campaign_results.sql`, `promotion_summary_items.sql`,
   `workflow_state.sql`, `kol_master.sql`, `kol_content_integrity.sql`,
   `audit_log.sql`, `feedback_p1.sql` — feature tables/columns. All idempotent.
   (`run_all_pending.sql` bundles a subset for convenience.)
3. **`security_p1.sql`** — the production RLS. Replaces every `demo_all` policy
   with authenticated staff/admin access + the `custom_access_token_hook`
   auth-role hook + agency confinement. **This is the RLS source of truth.**
4. **`security_p2.sql`** — hardening follow-up (locks `app_settings`, makes
   `kol_master_view` security_invoker, pins function `search_path`).

Then the two dashboard steps in `security_p1.sql`'s header (enable the Custom
Access Token hook; enable Leaked Password Protection) and set
`NEXT_PUBLIC_REQUIRE_AUTH=true` in Vercel.

## Production status (project `zxxpyknoymdlhckpchse`)

`security_p1.sql` + `security_p2.sql` are **applied**. Every table is
authenticated-staff/admin only (verified via the security advisor — clean except
the dashboard-only Leaked Password Protection toggle).

## Superseded / removed

- `rls_production.sql` — early RLS template, **superseded by `security_p1.sql`**.
  Removed to keep a single source of truth.

## Known schema drift (audit P3-8 — not dropped)

`brands`, `budget_items`, `pnl`, `workload_members`, `workflow_tasks`,
`kol_rank_weights` are **written by the seed route** (`/api/admin/seed`) and
referenced by the RLS loops, but the live app currently reads its data from other
sources. They are **not dropped** — doing so would break seeding and the RLS
policy loops for little benefit. Decide per-table (backfill-and-use vs. remove)
as a deliberate migration, not an ad-hoc drop.
