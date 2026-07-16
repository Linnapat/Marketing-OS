# Supabase — schema & migration source of truth

There is **no automatic migration runner**; migrations are plain SQL pasted into
the Supabase SQL Editor. To avoid the "which file is actually applied?" confusion
the audit flagged (P2-10), this file is the canonical order and status.

**Last verified against production (`zxxpyknoymdlhckpchse`): 2026-07-17.**

## ⚠️ Read before running anything

`custom_access_token_hook` — the function that decides every user's role at login —
exists in **three** files, because each security pass replaced it. Only the last is
current:

| file | default role | stamps `member_role` | |
|---|---|---|---|
| `security_p1.sql` | `staff` | no | ❌ fail-**open**: a signed-in non-member gets full staff access |
| `security_p3.sql` | `none` | no | ❌ breaks the Finance approval rules |
| **`security_p7.sql`** | `none` | **yes** | ✅ **current** |

**Never run p1 or p3 on their own to "fix auth"** — they silently downgrade
production. Replay them only in order, ending with p7. (`auth_setup.sql` held a
fourth, fail-open copy and was removed.)

## Apply order (fresh project)

1. `schema.sql` — base tables + **demo-open** RLS (`demo_all using(true)`). Fine for
   local/dev; **do not leave these policies on a shared/production project.**
2. `schema_v2.sql`, `campaign_types.sql`, `approval_feedback.sql`,
   `campaign_brief.sql`, `expenses_p1.sql`, `expenses_p2.sql`,
   `app_settings.sql`, `campaign_results.sql`, `promotion_summary_items.sql`,
   `workflow_state.sql`, `kol_master.sql`, `kol_content_integrity.sql`,
   `audit_log.sql`, `feedback_p1.sql` — feature tables/columns. All idempotent.
   (`run_all_pending.sql` bundles a subset for convenience.)
   Note `campaign_brief.sql` adds `campaigns.data` — the brief lives in that JSONB
   column; there is **no `campaign_brief` table**.
3. **`security_p1.sql`** — production RLS: replaces every `demo_all` policy with
   authenticated staff/admin access, adds the auth-role hook and agency confinement.
4. **`security_p2.sql`** — hardening (locks `app_settings`, `kol_master_view` →
   security_invoker, pins function `search_path`).
5. **`security_p3.sql`** — `audit_log` tamper-evidence + the `auth_admin_read_members`
   policy. **That policy is load-bearing**: the hook runs as `supabase_auth_admin`,
   which does *not* bypass RLS, so without it the hook reads zero members and every
   login falls to its default role. (§2's `app_role()` change is intentionally NOT
   applied — see Production status.)
6. **`security_p4.sql`** — `permissions` / `pnl` / `budget_items` → admin-only writes.
7. **`security_p5.sql`** — `members` → admin writes + staff self-update + the
   `members_guard` trigger that blocks self-escalation to `access='Admin'`.
   **Requires the code change that split member create/update off `.upsert()`** —
   Postgres checks the INSERT policy on every upsert, so applying this against the
   old code breaks a staff member's own-profile save.
8. **`security_p6.sql`** — `org_settings` per-key: admin writes governance (approval
   thresholds, VAT, brands…), staff writes only `creative_shoots_v2` and
   `member_profiles_v1`.
9. **`security_p7.sql`** — the current hook: fail-closed default + `member_role`.
10. `finance_atomic.sql` — atomic expense approve/reject RPCs.

Then: enable the **Custom Access Token** hook (Authentication → Hooks), disable open
sign-ups (Authentication → Email provider), and set `NEXT_PUBLIC_REQUIRE_AUTH=true`
in Vercel — **redeploy without build cache**, since `NEXT_PUBLIC_*` is baked in at
build time.

## Production status

Applied: `security_p1` → `p7` plus `finance_atomic.sql`. Auth is enforced, roles are
fail-closed, sign-up is invite-only, `audit_log` is tamper-evident, and the sensitive
tables (`permissions`, `pnl`, `budget_items`, `members`, `org_settings`) are
admin-write only.

Deliberately **not** applied: `security_p3.sql` **§2** (`app_role()` fallback `staff`
→ `none`). With the hook defaulting to `none` and sign-up disabled it is
belt-and-braces, and applying it costs every stale token its access until the next
refresh.

Security advisor is clean except `auth_leaked_password_protection`, which **cannot be
enabled on this plan** ("available on Pro Plans and up") — expected; see
`../PRODUCTION_HARDENING.md`.

Still open: **24 tables remain on the blanket `staff_rw` policy** — notably `expenses`
and `expense_requests`, where a staff can write money rows directly and bypass the
approval flow. `../PRODUCTION_HARDENING.md` has the plan and the query that counts them.

## Superseded / removed

- `rls_production.sql` — early RLS template, superseded by `security_p1.sql`.
- `auth_setup.sql` — early standalone copy of `custom_access_token_hook` that
  defaulted to `staff` (fail-open) and stamped no `member_role`. `AUTH.md` told
  people to run it, which would have downgraded production auth. Removed;
  `security_p7.sql` is the hook's only current home.

## Known schema drift (audit P3-8 — not dropped)

`brands`, `budget_items`, `pnl`, `workload_members`, `workflow_tasks`,
`kol_rank_weights` were written by the (since removed) seed route and are referenced
by the RLS loops, but the live app reads its data from other sources. They are **not
dropped** — that would break the RLS policy loops for little benefit. Decide per-table
(backfill-and-use vs. remove) as a deliberate migration, not an ad-hoc drop.
