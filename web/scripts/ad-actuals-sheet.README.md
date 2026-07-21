# Import ad actuals from Google Sheet

The team fills ad actuals in an **`Ad_Actuals`** tab of a Google Sheet; the app
reads that tab and upserts the rows into Supabase (`campaign_results`), which the
reporting reads. Supabase stays the source of truth — the sheet is the editable
input layer.

```
Team fills Ad_Actuals tab
  └─ Performance Center ▸ Platform / Ads ▸ "Import ads จาก Sheet"
       └─ GET /api/ad-actuals-sheet (server reads the tab, CORS-safe)
            └─ saveResults() → Supabase campaign_results (under the user's RLS)
```

## Sheet setup (one-time)
1. In the sheet, add a tab named exactly **`Ad_Actuals`**.
2. First row = headers (order doesn't matter; matching is case/spacing-insensitive
   and accepts common aliases):

   | campaign_id | ad | audience | role | platform | type | kpi | target | budget | days | cv_target_pct | reach_actual | budget_actual | conversions |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|---|

   - **campaign_id** is required (must match the app's campaign id, e.g. `CAM-2026-0001`) — rows without it are skipped.
   - **kpi** — `Reach` / `Click` / `Conversion`.
   - Numbers may include `฿`, commas, `%` — they're stripped on import.
3. Share the sheet **"Anyone with the link — Viewer"** (needed for the read).

## Using it
Performance Center → **Platform / Ads** tab → **Import ads จาก Sheet** → paste the
sheet link (remembered after the first time) → **นำเข้า**. A row count confirms,
then the page reloads with the imported actuals.

## Notes
- **Idempotent:** the row id is derived from `campaign_id + ad + platform + type`,
  so re-importing updates the same rows instead of duplicating them. (Renaming an
  ad/platform in the sheet creates a new row — the old one stays until deleted.)
- **KOL** is not imported here yet — say the word to add a symmetric
  `KOL_Actuals` import.
- Prefer a fixed sheet instead of pasting each time? We can store the URL as an
  app setting (like the performance-sheet route already does).
