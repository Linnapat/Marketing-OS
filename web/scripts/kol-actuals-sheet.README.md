# Import KOL actuals from Google Sheet

Closes the KOL loop: the app mirrors the KOL structure into the `KOL_Activities`
tab (see the campaign-sheet mirror), the team fills reach / engage / cost there,
and this import pulls it back into Supabase (`kol_collaboration_history`), which
the Monthly Branch Report reads.

```
Team fills KOL_Activities tab
  └─ Performance Center ▸ KOL ▸ "Import KOL จาก Sheet"
       └─ GET /api/kol-actuals-sheet (server reads the tab, CORS-safe)
            └─ ensureKolProfile() → kol_collaboration_history (under RLS)
```

## Sheet
Tab **`KOL_Activities`** with headers (case/spacing/slash-insensitive):
`campaign_id, branch, KOL ID, KOL name, category, followers, total_reach,
total_engage, food_cost, paid_cost, post_date`. Share the sheet
**"Anyone with the link — Viewer"**. `campaign_id` + `KOL name` are required.

## Behaviour
- **Sync:** each import replaces the sheet-sourced collaborations of every
  campaign in the sheet (tagged `source:"sheet"` in `data`); collaborations
  logged in-app are never touched.
- **KOL id:** when the row was mirrored from the app the `KOL ID` is the
  `kol_profiles` uuid and is used directly; otherwise a profile is found/created
  by name. Rows that can't resolve are skipped (reported in the count).
- **One source per KOL:** if the same KOL is both in the sheet and logged in-app,
  it becomes two collaborations — pick one entry point.
