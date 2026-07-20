# Campaign → Google Sheet mirror

Every campaign created in Marketing OS is also appended to a Google Sheet, so
the team has a live, filterable copy. Supabase stays the source of truth; the
sheet is a one-way mirror. If the sheet is unreachable, campaign creation still
succeeds (the mirror is best-effort).

```
Create campaign (app)
  └─ createCampaign() → Supabase (source of truth)
       └─ POST /api/campaign-sheet-sync  (server, holds the secret URL)
            └─ POST → Apps Script Web App → appendRow() to "Campaigns" tab
```

## One-time setup

1. **Create the Google Sheet** — a new blank spreadsheet (e.g. "Marketing OS —
   Campaigns"). No need to add columns; the script creates the `Campaign_Log` tab
   and header on the first campaign.

2. **Add the Apps Script**
   - In the sheet: `Extensions ▸ Apps Script`
   - Delete the placeholder and paste the contents of
     [`campaign-sheet.gs`](./campaign-sheet.gs)
   - Save

3. **Deploy as a Web App**
   - `Deploy ▸ New deployment ▸ ⚙ ▸ Web app`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, authorise, and copy the **Web app URL** (ends in `/exec`)
   - Sanity check: open that URL in a browser — it should return
     `{"ok":true,"service":"campaign-sheet-mirror"}`

4. **Point the app at it** — set the env var (Vercel project settings and/or
   local `.env.local`):
   ```
   CAMPAIGN_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
   ```
   Redeploy / restart. Until this is set, the mirror is a silent no-op.

## Test it
Create a campaign in the app → a new row appears on the `Campaign_Log` tab within a
second. Columns: `created_at, campaign_id, name, brand, branch, owner, budget,
dates, status, camp_type`.

## Notes
- **Re-deploying the script:** use `Deploy ▸ Manage deployments ▸ ✏ ▸ New
  version` so the `/exec` URL stays the same (a brand-new deployment mints a new
  URL you'd have to update in the env).
- **Security:** the `/exec` URL is the only secret and it lives server-side
  (never sent to the browser). The endpoint only appends rows. To harden
  further, store a token in the script's Project Settings ▸ Script Properties
  and check it in `doPost` before appending.
- **Updates/deletes** are not mirrored — only new campaigns are appended. Say
  the word if you want status changes to update the matching row too.
