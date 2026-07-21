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
     `{"ok":true,"service":"sheet-mirror"}`

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

## Multiple sheets, one per brand

Different brands can mirror into **different physical spreadsheets** — useful
when different teams/people each own a brand and shouldn't need to touch (or
even see) another brand's sheet.

1. Repeat the "Create the Google Sheet" + "Add the Apps Script" + "Deploy as a
   Web App" steps above **once per brand's spreadsheet** — each gets its own
   `/exec` URL (same `campaign-sheet.gs` script, pasted into each sheet).
2. Instead of (or in addition to) `CAMPAIGN_SHEET_WEBHOOK_URL`, set
   `CAMPAIGN_SHEET_WEBHOOKS` to a JSON map of brand id → that brand's `/exec` URL:
   ```
   CAMPAIGN_SHEET_WEBHOOKS={"omakase":"https://script.google.com/.../exec","teppen":"https://script.google.com/.../exec"}
   ```
   Brand ids match Settings ▸ Brands in the app (e.g. `omakase`, `teppen`,
   `mainichi`, `touka`). A brand not listed falls back to
   `CAMPAIGN_SHEET_WEBHOOK_URL` (or is skipped if that's empty too), so you can
   migrate one brand at a time.
3. Reads (Ad_Activities / KOL_Activities import) already work per-sheet with no
   change needed — each brand's team just pastes their own sheet's link into the
   Import buttons in Performance Center. Since every campaign has one globally
   unique `campaign_id` (created by the app), importing brand A's sheet can only
   ever touch brand A's campaigns — there's no cross-brand collision as long as
   everyone uses the `campaign_id` the app generated (not a hand-picked short
   code reused across sheets).

## Notes
- **Re-deploying a script:** use `Deploy ▸ Manage deployments ▸ ✏ ▸ New
  version` so the `/exec` URL stays the same (a brand-new deployment mints a new
  URL you'd have to update in the env).
- **Security:** the `/exec` URL(s) are the only secret and live server-side
  (never sent to the browser). The endpoint only appends rows. To harden
  further, store a token in each script's Project Settings ▸ Script Properties
  and check it in `doPost` before appending.
- **Updates/deletes** are not mirrored — only new campaigns/KOL are appended.
  Say the word if you want status changes to update the matching row too.
