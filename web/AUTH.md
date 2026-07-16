# Enabling login (Supabase Auth) + database-level security

The app runs **open** by default (gated only by Vercel Deployment Protection).
Turn on real logins when you want people — especially external agencies — to sign
in themselves. Do the steps in order so you don't lock yourself out.

## 1. Enable Email auth in Supabase
Dashboard → **Authentication → Providers → Email** → enable. For a quick internal
rollout you can turn **"Confirm email" off** (Authentication → Providers → Email)
so accounts work immediately.

## 2. Create your first user
Either:
- Dashboard → **Authentication → Users → Add user** (email + password), or
- Deploy this app, open **`/login`**, click **Create an account** (limited to
  `@teppenthailand.co.th`).

Make sure the same email exists in the **`members`** table (Settings → Users, or
the Table Editor). The member row's `access` / `role` decides what they can do:
`access = Admin` → full admin; `brand_access = External only` or a role
containing "agency" → Agency (external, task-list only).

## 3. Turn on auth in the app
Vercel → Environment Variables → add **`NEXT_PUBLIC_REQUIRE_AUTH = true`** →
Redeploy. Now every visitor must sign in; the sidebar shows their name/role and
a sign-out button, and the "viewing as" role defaults to their real role.

> Only flip this after step 2 — otherwise you'll be redirected to /login with no
> account to sign in with. To undo, delete the variable and redeploy.

## 4. (Recommended) Enforce access in the database
So the rules hold even outside the UI:

1. SQL Editor → run **`supabase/auth_setup.sql`** (adds an `app_role` claim to
   each user's token from their members row).
2. Dashboard → **Authentication → Hooks → Custom Access Token** → enable and
   select `public.custom_access_token_hook`.
3. SQL Editor → run **`supabase/security_p1.sql`** then **`supabase/security_p2.sql`**
   (replaces the demo-open policies: staff/admin get the internal tables; the
   **agency** role can reach **only `agency_tasks`**). See `supabase/README.md`
   for the full canonical apply order.

After this, an agency user's session can read/write nothing but their external
task list — enforced by Postgres, not just the UI.
