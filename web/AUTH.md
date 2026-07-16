# Login & database-level security — how it works today

**Auth is ON in production** (as of 2026-07-16). This file describes the live setup.
It used to be a "how to turn auth on" guide; those steps are done, and following
them again would downgrade the system — see *Do not do these* at the bottom.

Last verified: 2026-07-17.

## How a login resolves

1. A user signs in at `/login` (email + password, Supabase Auth).
2. Supabase runs the **Custom Access Token hook** (`public.custom_access_token_hook`,
   Authentication → Hooks) which reads their row in **`members`** and stamps two
   claims into the JWT:
   - **`app_role`** → `admin` | `staff` | `agency` | `none` — drives nearly all RLS.
     `access = Admin` → `admin`; `brand_access = External only` or a role containing
     "agency" → `agency`; otherwise `staff`. **No members row → `none`** (fail-closed:
     they see nothing).
   - **`member_role`** → the raw `members.role` string (`"CMO"`,
     `"Marketing Manager / BGL"`, `"Co-ordinator"`…), for rules `app_role` is too
     coarse to express. Nothing enforces it yet — it's the base for the Finance
     approval rules.
3. The app enforces auth only when **`NEXT_PUBLIC_REQUIRE_AUTH=true`** (Vercel).
   That's a **build-time** value: changing it does nothing until a redeploy
   **without build cache**.
4. Postgres RLS does the real enforcement, using `app_role()` (reads the claim).
   The UI's permission matrix only hides buttons.

## Adding a person

**Self sign-up is disabled** — the `@teppenthailand.co.th` check in `login/page.tsx`
was client-side only, so anyone could call `signUp()` directly and land as `staff`.
Now an admin invites instead:

1. Supabase → **Authentication → Users → Add user** (email + password).
2. Add the **same email** to the **`members`** table (Settings → Users & Roles).
   Without a members row the hook stamps `none` and they see nothing.
3. Their `access` / `role` decide what they can do (see step 2 above).

Tokens refresh roughly hourly, so a role change lands on its own; a sign-out/in
applies it immediately.

## The one policy everything depends on

The hook runs as the **`supabase_auth_admin`** role, which does **not** bypass RLS.
`members` therefore needs `auth_admin_read_members` (in `supabase/security_p3.sql`)
or the hook reads **zero** rows, every login falls to the default role, and the whole
app goes blank for everyone. This has happened once — see
`PRODUCTION_HARDENING.md` → *Gotchas*.

## Do not do these

- **Don't run `supabase/security_p1.sql` or `security_p3.sql` alone to "fix auth".**
  Both contain older copies of the hook — p1's defaults to `staff` (fail-**open**:
  a signed-in non-member gets full staff access) and neither stamps `member_role`.
  **`supabase/security_p7.sql` is the current definition.** (`auth_setup.sql`, which
  this file used to tell you to run, held a fourth fail-open copy and was deleted.)
- **Don't enable Captcha protection** (Authentication → Attack Protection). `/login`
  calls `signInWithPassword` with no captcha token, so turning it on locks everyone
  out. It needs a login-page change first.
- **Don't re-enable open sign-ups** without also making a non-member resolve to `none`
  — which the hook already does, but the pairing is the point.

See `supabase/README.md` for the canonical SQL apply order and what's live, and
`PRODUCTION_HARDENING.md` for the remaining gaps.
