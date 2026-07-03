# Connecting Marketing OS to Supabase

The app works out of the box on mock data. Follow these steps once to make data
**real and persistent** — after this, every create/edit is saved to your database
and the modules read from the same source.

> **Fallback guarantee:** if the env vars below are missing, the app silently
> uses the bundled mock data. Nothing breaks; Vercel keeps deploying.

---

## 1. Create a Supabase project (~3 min)

1. Go to <https://supabase.com> → **New project**.
2. Name it (e.g. `marketing-os`), set a database password, pick a region close to you.
3. Wait for it to finish provisioning.

## 2. Create the tables (~1 min)

1. In the project, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql) and click **Run**.
   - It creates all tables for the 12 modules and enables (demo-open) security.
   - Safe to re-run.

## 3. Get your keys

Project → **Settings → API**, copy:

| Key | Where it goes |
|-----|---------------|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon public** key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role** key (secret) | `SUPABASE_SERVICE_ROLE_KEY` |

## 4. Add the keys to Vercel

Vercel project → **Settings → Environment Variables** → add the three above
(Production + Preview) → **Redeploy**.

For local dev, copy `.env.example` to `.env.local` and fill the same three values.

## 5. Seed the database with the demo data (once)

This copies the current mock content into your tables so you start from the same
populated state. Run it **once** after step 4, using your `service_role` key:

```bash
curl -X POST https://<your-app>.vercel.app/api/admin/seed \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
```

You'll get back a JSON summary of how many rows were inserted per table.

---

## What's wired

- **Foundation (this phase):** Supabase client + full schema for all 12 modules +
  seed route + graceful mock fallback.
- **Next:** each module's reads/writes switch to the database, starting with
  **Campaigns → Content → Tasks** (relational: a task/content row links to its
  campaign via `campaign_id`, so campaign roll-ups update live).

## Security note

`schema.sql` ships **demo-open** RLS policies so the anon key can read/write
immediately. Before a public launch, replace the `demo_all` policies with
role-aware rules (see the commented block at the bottom of `schema.sql`) and add
Supabase Auth so the **Agency** role can only reach `agency_tasks`.
