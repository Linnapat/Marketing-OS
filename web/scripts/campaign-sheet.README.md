# App → Google Sheet mirror

Structure created in Marketing OS is also appended to a Google Sheet, so the
team has a live copy and only fills the actuals. Supabase stays the source of
truth; the mirror is one-way and best-effort (a Sheet hiccup never blocks the
save).

Two things mirror today:
- **Create a campaign** → row on the **Campaigns** tab
  (`campaign_id, campaign_name, brand, branch, KPI, start, end, budget_plan, notes`)
- **Assign a KOL to a campaign** → row on the **KOL_Activities** tab
  (structure only: `campaign_id, branch, KOL ID, KOL name, category, followers,
  status, food_cost, paid_cost` — reach/engage and formula columns stay blank
  for the team to fill)

```
Create campaign / assign KOL (app)
  └─ createCampaign() / createKol() → Supabase (source of truth)
       └─ mirrorRowToSheet(tab, headers, row)
            └─ POST /api/campaign-sheet-sync  (server, holds the secret URL)
                 └─ POST → Apps Script Web App → appendRow() to the named tab
```

The Apps Script is **generic** (`{ tab, headers, row }`) — new mirrors just send a
different tab, no re-deploy needed. Note: when a tab already has formula columns
(e.g. KOL_Activities `cost/reach`), appended rows leave those cells blank —
extend the formula down or use an `ARRAYFORMULA` header.

## One-time setup

1. **Create the Google Sheet** — a new blank spreadsheet (e.g. "Marketing OS —
   Campaigns"). No need to add columns; the script creates the `Campaigns` tab
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
Create a campaign in the app → a new row appears on the `Campaigns` tab within a
second, matching the reporting template's columns: `campaign_id, campaign_name,
brand, branch, KPI, start, end, budget_plan, notes`. KPI and notes are left blank
for the team to fill; when the mirror targets an existing template `Campaigns`
tab, rows append below the current ones.

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
