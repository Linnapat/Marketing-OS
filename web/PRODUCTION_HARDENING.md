# Production Hardening — action list (from the 2026-07-16 audit)

Code fixes from the audit are already in the repo. The items below touch the
**live system** (Vercel env, Supabase dashboard, production DB) and were left for
a human to apply, in order. Do them on a Supabase **branch** first where noted.

---

## 0. P0 — the deploy is currently non-functional (do this first)

**Symptom:** production shows 0 campaigns / 0 tasks / empty finance even though the
database is fully populated (campaigns 5, tasks 28, kols 14, members 6).

**Cause:** `NEXT_PUBLIC_REQUIRE_AUTH` is **not** `true` on Vercel, so the app runs
"auth off" and talks to Supabase with the **anon** client — but Row Level Security
requires an authenticated staff/admin session, so anon reads return nothing and any
write is rejected. RLS (DB) is ON while auth (app) is OFF — the worst combination.

**Fix (all three, together):**
1. Supabase → **Authentication → Hooks → Custom Access Token** → enable
   `public.custom_access_token_hook`. (Without it every login is plain `staff`.)
2. Vercel → Project → Settings → Environment Variables → set
   `NEXT_PUBLIC_REQUIRE_AUTH=true` (Production) → **Redeploy**.
3. Verify: open prod → you should hit **/login**; sign in as a member → the
   dashboard shows real data; `/api/health` returns `seeded:true`.

Members must sign out and back in once after step 1 for the `app_role` claim to appear.

---

## 1. P1 — lock down self sign-up (do this FIRST — lowest risk)

The `@teppenthailand.co.th` restriction in `login/page.tsx` is **client-side only**;
`supabase.auth.signUp` can be called directly with any email, and a non-member account
today resolves to `staff` (full data access). Closing the sign-up vector removes that
risk with **no SQL and no lockout risk**:
- Supabase → Authentication → Providers → Email → **disable open sign-ups**, and invite
  members instead. (Recommended — once done, non-members simply can't exist.)

## 2. P1 — fail-closed role fallback (optional defense-in-depth, coordinate it)

`security_p3.sql` section 2 changes the role fallback from `staff` to `none`, so an
authenticated caller with no `app_role` claim gets no access. With sign-up already
disabled (step 1) this is belt-and-suspenders, so it's optional — but it hardens the
system against any future misconfiguration.

⚠️ **This step can log members out of their data if rushed.** It relies entirely on the
JWT `app_role` claim (set by the enabled hook). A member still on a token issued *before*
the hook was enabled has no claim → resolves to `none` → sees no data until they sign out
and back in. (This is what caused the "data disappeared" during the audit — a stale session,
plus an earlier draft that made `app_role()` read the `members` table and recurse through
its own RLS. The file now uses the simple claim-only form.)

**Root cause of the "data disappeared" incident:** the hook runs as `supabase_auth_admin`,
which does NOT bypass RLS, and `members` had no policy granting it. So at real login the
hook read zero members rows and fell to its default. With the default flipped to `none`
(and no members-read policy), every login resolved to `none` → all data hidden. The fix is
the `auth_admin_read_members` policy now in `security_p3.sql` section 2a — without it the
`none` default locks everyone out.

To apply safely:
1. Confirm the hook is enabled (Auth → Hooks) — it is.
2. Run section 2a (the `auth_admin_read_members` policy) FIRST — this is what lets the hook
   resolve real roles at login.
3. Ask **every** team member to sign out and back in once (fresh token with the claim).
4. Run the rest of `security_p3.sql`.
5. Verify each role can still see its data; keep the rollback block from the audit handy.

The `audit_log` tamper-evidence in section 1 of the file is independent and safe to run
on its own (it only removes UPDATE/DELETE on that one table).

## 3. P3 — Leaked Password Protection: BLOCKED (Pro plan only) — don't chase it

The `auth_leaked_password_protection` advisor WARN **cannot be cleared on this
project's current (Free) plan**. Tried 2026-07-17 at
Authentication → Attack Protection → "Prevent use of leaked passwords" →
"Configure in email provider" → toggle on → Save, which returns:

> Failed to update auth configuration: Configuring leaked password protection
> via HaveIBeenPwned.org is available on Pro Plans and up.

So this warning is **expected and accepted** until/unless the project is upgraded
to Pro. Do not spend time on it again.

**Free-plan mitigations (do these instead — Authentication → Sign In / Providers → Email):**
- **Minimum password length: 6 → 8** (Supabase's own recommendation).
- **Password requirements:** require letters + digits.

Residual risk is low: self sign-up is disabled (step 1), so the only accounts are
the handful of known team members — there's no public surface where a weak
password could be introduced by a stranger.

⚠️ Also on that Attack Protection page: **leave "Enable Captcha protection" OFF.**
The app's login calls `signInWithPassword` without a captcha token, so switching
Captcha on would lock everyone out. Enabling it later means changing the login
page first.

## 4. Remove / protect the seed tool

`/admin/seed` accepts the `service_role` key pasted into the browser. Once the DB is
seeded, delete `src/app/admin/seed/page.tsx` + `src/app/api/admin/seed/route.ts`, or
move seeding to a server-side one-off script. The page's CMO gate is client-side only
— the API is protected by the key itself, but the page should not ship long-term.

---

## Follow-ups (design + branch testing required — not yet in repo)

- **P1-1 full per-module/brand RLS.** Today every `staff` has full CRUD on every
  table; the permission matrix + brand visibility are enforced only in the UI. Move
  them into RLS (see the commented sketch at the bottom of `security_p3.sql`). At a
  minimum, make `members`, `permissions`, and `pnl` **admin-write only**.
- **P2-2 atomic money writes.** `approveExpenseRequest` / `rejectExpenseRequest` write
  to several tables in sequence with no transaction. Move each into a single Postgres
  RPC (`security definer`) so the request-status change, spending-log insert, and
  linked-card update commit or roll back together, then call it from `lib/db/finance.ts`.
  (The in-code race guards and error surfacing added in the audit reduce, but do not
  eliminate, partial-write windows.)
