# Production Hardening — status & remaining work

Started from the 2026-07-16 audit. **Last verified against production: 2026-07-17.**

This file is the source of truth for *what is actually enforced in production*.
Every number and claim below has the query that produced it, so you can re-derive it
yourself instead of trusting this file — **do that before acting on it**, since a doc
goes stale the moment someone changes a policy.

---

## How to re-verify this whole file in 30 seconds

```sql
-- 1) How many tables are still wide open to any staff member?
--    "Open"   = the table still carries the original `staff_rw` policy, which is
--               ALL (select+insert+update+delete) for anyone whose app_role is
--               admin OR staff.
--    "Locked" = we replaced staff_rw with narrower policies.
with t as (
  select c.relname as tbl,
         (select string_agg(distinct p.policyname, ',' order by p.policyname)
            from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
)
select count(*) filter (where policies like '%staff_rw%')     as still_open,
       count(*) filter (where policies not like '%staff_rw%') as locked,
       count(*)                                               as total_rls_tables,
       string_agg(tbl, ', ' order by tbl) filter (where policies not like '%staff_rw%') as locked_tables
from t;

-- 2) Who can log in, and who is a member but has no account?
--    (Self sign-up is disabled, so a member without an account CANNOT create one —
--     an admin must invite them.)
select (select count(*) from members)    as members_rows,
       (select count(*) from auth.users) as auth_accounts,
       (select string_agg(m.email, ', ' order by m.email) from members m
          left join auth.users u on lower(u.email)=lower(m.email)
         where u.id is null)             as members_without_login;

-- 3) What role will each person actually get at login? (hook output, not a guess)
select u.email,
       public.custom_access_token_hook(jsonb_build_object('claims', jsonb_build_object('email', u.email))) -> 'claims' ->> 'app_role'    as app_role,
       public.custom_access_token_hook(jsonb_build_object('claims', jsonb_build_object('email', u.email))) -> 'claims' ->> 'member_role' as member_role
from auth.users u order by u.email;
```

**Result on 2026-07-17:** `still_open = 24`, `locked = 7`, `total_rls_tables = 31`.
Locked: `agency_tasks, audit_log, budget_items, members, org_settings, permissions, pnl`
(`agency_tasks` was already scoped by `security_p1.sql`; the other 6 are this work.)
Members `6`, auth accounts `4`, **without login: `kittinan.k`, `Preeyaporn.h`**.

---

## The mental model (read this before changing anything)

1. **The database is the only real boundary.** The Settings → Permissions matrix and
   brand visibility are *UI-only* — they hide buttons. Anyone signed in can open
   devtools and call Supabase directly. So "is X protected?" is answered by
   `pg_policies`, never by the React code.
2. **Roles the DB understands.** The login hook (`custom_access_token_hook`) reads
   `members` and stamps two JWT claims:
   - `app_role` → `admin` | `staff` | `agency` | `none` (coarse; drives most RLS)
   - `member_role` → the raw `members.role` string, e.g. `"CMO"`,
     `"Marketing Manager / BGL"`, `"Co-ordinator"` (granular; nothing enforces it yet)

   A policy must **never query `members` itself** to find the role — the hook runs as
   `supabase_auth_admin`, which does not bypass RLS, and policies calling back into
   `members` invite recursion. Read the claim instead.
3. **Fail-closed.** A signed-in user who isn't in `members` gets `app_role = 'none'` and
   sees nothing. Self sign-up is off, so strangers can't get an account at all.
4. **The counting rule used throughout this file:** a table is "open" if it still has the
   `staff_rw` policy. That one policy is what the original `security_p1.sql` applied to
   *everything*, so its presence/absence is a reliable flag for "we have not narrowed
   this table yet." That's where the 24 / 7 / 31 numbers come from — not a hand count.

---

## DONE — enforced in production (verified)

| # | What | Why it mattered | Where |
|---|---|---|---|
| P0 | Auth actually on: `NEXT_PUBLIC_REQUIRE_AUTH=true` + hook enabled + `auth_admin_read_members` policy | RLS was ON while the app talked to Supabase as anon → **every page showed 0 rows and nothing could be saved**, even though the DB was full | Vercel env + `security_p3.sql` |
| P1 | Self sign-up disabled (invite-only) | The `@teppenthailand.co.th` check is client-side only; anyone could call `signUp()` directly and land as `staff` | Supabase → Auth → Email provider |
| P1 | Fail-closed roles (hook default `none`) | A non-member used to silently resolve to `staff` = full access | `security_p3.sql` / `security_p7.sql` |
| P1-1 | `permissions`, `pnl`, `budget_items` → **admin-only writes**, staff read | No non-admin write path exists in the app, so locking them is invisible to users but stops a staff account rewriting the permission matrix or the P&L | `security_p4.sql` |
| P1-1 | `members` → admin writes + staff self-update + `members_guard` trigger | **The escalation path**: `members.access` feeds the hook, so a staff who could write their own row could set `access='Admin'` and be admin at next login | `security_p5.sql` |
| P1-1 | `org_settings` → per-key: admin writes governance; staff writes only `creative_shoots_v2` + `member_profiles_v1` | It mixes governance (**approval thresholds/rules**, VAT, fiscal year, brands) with two keys staff legitimately write. Any staff could have lowered the budget approval threshold | `security_p6.sql` |
| P2 | `audit_log` tamper-evident (INSERT+SELECT only; no UPDATE/DELETE policy) | A staff could erase their own trail | `security_p3.sql` §1 |
| P2 | Atomic expense approve/reject via RPC | Status change + spending-log insert + card update were 3 separate writes — a mid-way failure left the money records half-applied | `finance_atomic.sql` + `lib/db/finance.ts` |
| P2 | Auth guards on the sheet API routes · escaped notification email HTML · `/admin/seed` removed | Open endpoints / HTML injection / `service_role` key pasted into a browser | merged |
| — | Finance **Phase 1**: hook also stamps `member_role` | Prerequisite for enforcing "only CMO + Marketing Manager/BGL may approve" in the DB. Additive — nothing enforces it yet | `security_p7.sql` |

**How each lock was proved** (not asserted): simulate a real session and check the row
count actually affected —

```sql
begin;
select set_config('request.jwt.claims',
  '{"email":"<a staff member>","app_role":"staff","role":"authenticated"}', true);
set local role authenticated;
-- expect 0 rows: RLS gives staff no UPDATE path on permissions
with u as (update permissions set descr = descr where true returning 1)
select (select count(*) from u) as staff_rows_updated;
rollback;
```

The same shape proved: staff `update members set access='Admin'` on their own row
**raises** (the guard trigger), staff can still rename themselves (**1 row**), and admin
still updates anyone (**1 row**). Each `security_p*.sql` header carries its own test block.

---

## OPEN — the real remaining gaps

### 1. 24 tables are still `staff_rw` (biggest gap)

Any signed-in staff can insert/update/delete rows in all of them regardless of what the
Settings → Permissions matrix says, because the matrix is UI-only.

**Highest risk: `expenses` + `expense_requests`** — a staff can write money records
directly via the API, bypassing the approval flow. (The atomic RPC governs the path that
goes through the UI; it does not stop a direct table write.)

Agreed business rules (from the CMO, 2026-07-16):

| Action | Who |
|---|---|
| Create an expense request | everyone |
| Approve / reject | **CMO** and **Marketing Manager / BGL** |
| Mark Paid (Spending Log) | **Co-ordinator** |
| See requests | everyone (no per-requester scoping) |

Plan (phase 1 done):
2. Move every finance write into **SECURITY DEFINER** RPCs that check `member_role()`
   internally (create / submit-draft / update / approve / reject / mark-paid).
   `approve_expense_request` + `reject_expense_request` exist but are SECURITY INVOKER —
   they need the role check added.
3. Lock `expense_requests` + `expenses`: SELECT for all staff/admin, writes admin-only;
   everything else goes through the RPCs.
4. Rewire `lib/db/finance.ts`, test, deploy.

Everything else (`campaigns`, `content_posts`, `kols`, `tasks`, `graphic_requests`, …)
follows the same shape once the Finance group proves the pattern.

### 2. Brands are a fixed 4-brand union — Settings can't really add brands

`BrandId` is `"teppen"|"omakase"|"mainichi"|"touka"` in `src/lib/brands.ts`, and
`BRAND_ORDER` drives ~9 files. `applyBrandOverrides` skips any key not in that union
(`if (!(c.key in BRANDS)) continue`), so **renaming/recolouring the 4 works, but adding a
brand in Settings goes nowhere**, and deleting one doesn't remove it from the modules.
Making this data-driven is a real refactor (it touches the P&L math).

### 3. Two members cannot log in

`kittinan.k` and `Preeyaporn.h` are in `members` but have no auth account, and self
sign-up is disabled — **they cannot create one themselves.** An admin must invite them:
Supabase → Authentication → Users → Add user.

### 4. Smaller

- Empty-state and error-state look identical in the UI (a failed load reads as "no data yet").
- Brief & Bite (`/requests`) and Ready to Serve (`/approvals`) are `ComingSoon`
  placeholders; the full implementations are in git history. Product decision.
- `security_p3.sql` §2 (`app_role()` fallback `staff` → `none`) is deliberately **not**
  applied — with the hook defaulting to `none` and sign-up disabled it's belt-and-braces,
  and applying it means every stale token loses access until re-login.

---

## BLOCKED — do not chase

**Leaked Password Protection** (`auth_leaked_password_protection` advisor WARN) **cannot
be enabled on this project's plan.** Tried 2026-07-17 via Authentication → Attack
Protection → "Prevent use of leaked passwords" → "Configure in email provider" → toggle
→ Save:

> Failed to update auth configuration: Configuring leaked password protection via
> HaveIBeenPwned.org is available on Pro Plans and up.

The warning is **expected and accepted** until the project moves to Pro. The advisor is
otherwise clean.

Free-plan mitigations instead (Authentication → Sign In / Providers → Email):
**Minimum password length 6 → 8**, and set **Password requirements** (letters + digits).
Residual risk is low: sign-up is disabled, so the only accounts are known team members.

⚠️ On that same page, **leave "Enable Captcha protection" OFF.** The login calls
`signInWithPassword` with no captcha token, so turning Captcha on locks everyone out.
Enabling it later means changing the login page first.

---

## Gotchas that have already bitten us once

- **`NEXT_PUBLIC_*` is baked in at build time.** Setting it in Vercel does nothing until a
  **redeploy without build cache**.
- **The hook runs as `supabase_auth_admin`, which does not bypass RLS.** `members` must
  keep the `auth_admin_read_members` policy, or every login silently falls to the hook's
  default role — this is what caused the "all the data disappeared" incident.
- **`security_p7.sql` holds the current hook definition.** `security_p3.sql` and
  `security_p5.sql` contain older copies that do **not** stamp `member_role`; re-running
  either drops the claim.
- **Don't use `.upsert()` on `members`.** Postgres checks the INSERT policy on every
  upsert, so an admin-only INSERT policy breaks a staff member's own-profile save.
  `createMember` uses `insert`; `updateMember` uses `update`.
- **After any hook/role change, tokens must refresh** before the new claims exist.
  Supabase refreshes automatically (~hourly), so usually wait rather than forcing a
  re-login.
