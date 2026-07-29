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
   `member_profiles_v1`. **Superseded by `caption_templates.sql`**, which re-creates
   `org_staff_write` with one more key — apply that after this one.
9. **`security_p7.sql`** — the current hook: fail-closed default + `member_role`.
10. `finance_atomic.sql` — atomic expense approve/reject RPCs.
11. **`caption_templates.sql`** — lets staff write the shared caption-template key
    (`caption_templates_config`). Required by the Caption tab's "Save hashtag set /
    CTA / footer"; without it those saves fail for everyone but an admin.
12. `security_p9_brand_scope.sql`, `security_p11_module_matrix.sql` — brand scoping
    and the per-module levels behind `has_module()`.
13. **`security_p12_expense_approval.sql`** — the expense-approval rules move into
    the database (CMO-only approve, own-row submit for everyone, brand-scoped reads,
    non-forgeable audit actors) **and** the fail-closed `app_role()`. Rollback lives
    in `security_p12_expense_approval_rollback.sql`.

Then: enable the **Custom Access Token** hook (Authentication → Hooks), disable open
sign-ups (Authentication → Email provider), and set `NEXT_PUBLIC_REQUIRE_AUTH=true`
in Vercel — **redeploy without build cache**, since `NEXT_PUBLIC_*` is baked in at
build time.

## Production status

**Last verified against production: 2026-07-30** (audit + `security_p12`).

Applied: `security_p1` → `p7`, `finance_atomic.sql`, `security_p9_brand_scope.sql`,
`security_p11_module_matrix.sql`, and **`security_p12_expense_approval.sql`**. Auth is
enforced, roles are fail-closed, sign-up is invite-only, and the sensitive tables
(`permissions`, `pnl`, `budget_items`, `members`, `org_settings`) are admin-write only.

`security_p3.sql` §2 (`app_role()` fallback `staff` → `none`) **is now applied** — it
moved into `security_p12`. It had been deferred as belt-and-braces; the 2026-07-30
audit re-raised it because a token minted without the hook resolved to full staff
access. Applied off-hours since every un-refreshed token loses access until it renews
(~1 hour).

### What `security_p12` changed (2026-07-30 audit findings)

The rule "เฉพาะ CMO อนุมัติเบิกงบ" lived only in the UI and in these docs. In the
database:

| | before | after |
|---|---|---|
| `approve_expense_request()` | no role check at all | raises unless `app_role()='admin'` or `member_role()='CMO'` |
| `expense_requests` UPDATE | `has_module('Finance','View')` | `has_module('Finance','Approve')` |
| `expense_requests` SELECT | `Finance >= View`, **no brand scope** | own rows always, others need `Finance >= View` **and** `brand_visible()` |
| `expense_requests` INSERT | `Finance >= View` | anyone internal, but only as themselves and only as `Waiting Approval` with `approved = 0` |
| `audit_log.actor_email` | no default, never compared to the JWT | defaults from the JWT and must match it |
| money decisions in `audit_log` | client-side, best-effort, skipped entirely by a direct RPC call | written **inside** the approve/reject transaction |

Verified after applying: a Co-ordinator calling the RPC gets `42501`; a Marketing
Manager / BGL sees 17 of 32 requests instead of all 32; the CMO still approves.

Submitting is deliberately **not** gated on the Finance module — the CMO confirmed on
2026-07-30 that everyone on the team may submit an expense request, and the old gate
locked out the five roles with `Finance = "—"`. `/expenses` is therefore no longer in
`ROUTE_MODULE` (`src/lib/permissions.ts`); the Spending Log tab keeps the Finance gate.

Security advisor: `function_search_path_mutable` on `owns_designer_slot` is fixed. The
remaining warnings are the `SECURITY DEFINER` functions reachable over `/rest/v1/rpc`
(they return null/false without a JWT) and `auth_leaked_password_protection`, which
**cannot be enabled on this plan** ("available on Pro Plans and up") — expected; see
`../PRODUCTION_HARDENING.md`.

**Do not trust a "still open" list here without re-running the query.** The line this
section used to carry — "24 tables remain on the blanket `staff_rw` policy, notably
`expenses` and `expense_requests`" — was already false when the audit checked: both had
been moved to `has_module()` by `security_p11`. A stale security doc is worse than none,
because it stops people looking. Count them for yourself:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname='public'
  and coalesce(qual,'') !~ 'has_module|brand_visible'
  and coalesce(with_check,'') !~ 'has_module|brand_visible'
order by tablename;
```

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
