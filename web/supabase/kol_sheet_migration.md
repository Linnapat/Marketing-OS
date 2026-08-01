# KOL — migrating off the Google Sheet (2026-08-01)

Source workbook: **KOLs_Framework_2026**
`1lGa77_twc9bzQFn7D0vqHgiHcCBZDV_mwrwHcnZFR_4` (shared "anyone with the link")

This records what was moved, how, and what is deliberately still missing — so the
next person does not have to re-derive any of it from the sheet.

## What landed

| Sheet tab | → | Rows |
|---|---|---|
| `KOL_MASTER` | `kol_profiles` + `kol_channels` | 310 rows → **302 profiles** (7 duplicate-name groups merged) |
| `KOL_MASTER` follower-cell hyperlinks | `kol_channels.handle_url` | **484 links** |
| `CONTENT_LOG_Teppen` / `_OmakaseDon` / `_Mainichi` / `_Phuket` | `kol_collaboration_history` | 73 + 63 + 16 + 17 = **169 engagements** |
| per-platform reach/engagement columns | `kol_engagement_posts` | **223 result rows** |
| `*_Link` cell hyperlinks in the logs | `kol_engagement_posts.post_url` | **256 links** |
| `Rate_THB` / `Rate_Note` + `Why Good?` | `kol_rate_cards` | **166 cards** (99 with a price) |

Totals reconciled against an independent local parse of the same sheets:
reach **14,719,993** · engagement **743,357** · cost **฿868,199** · 141 distinct KOLs used.

## How the data was moved

Two transports, chosen per source because neither alone works:

1. **gviz JSON, fetched by Postgres itself** (`create extension http` → fetch →
   `drop extension http`). Used for all cell *values*. The payload is far too
   large to pass through a SQL literal by hand.
2. **Hand-carried encoded strings, verified by md5.** Used for *hyperlinks* only —
   gviz and the CSV export both drop them, and the per-sheet HTML export is not
   reachable by URL. URLs were prefix-compressed (`https://www.instagram.com/` → `I`)
   to ~13 KB, then the reassembled string's md5 was checked against the local file
   before decoding. Both transfers matched on the first verified attempt.

### Traps that cost real time — do not re-discover these

- **`read_file_content` on this workbook returns only 129 of 310 `KOL_MASTER` rows**
  and shifts columns when a cell contains a line break. Use the CSV export.
- **gviz drops the header label of any column it types as numeric**, so header-name
  lookup silently fails. Column indices are pinned per sheet in the import SQL
  instead, and were verified cell-by-cell against the HTML export first: every
  numeric column matched 100% before anything was inserted.
- **Two `KOL_ID` cells carry a trailing newline** (`KOL-0204\n`, `KOL-0288\n`).
  `btrim(x)` alone does not strip it — use `btrim(x, E' \t\r\n')`. Without this the
  import silently lands 167 rows instead of 169.
- **`Visited Date` is not a date column.** It holds table-booking blobs
  (`12/3/26 Name: … Tel: … People: 2 Branch: …`). Only the leading date is parsed;
  the full text is kept in `data.visit_raw`.
- One booking date is invalid (`21/16/26`, month 16) and is skipped, not guessed.

## Deliberately incomplete

- **`campaign_id` is set on 20 of 169 rows.** The `campaigns` table only starts at
  2026-07 while the logs go back to 2025-11, and the names do not match
  (`Eat Drink Celebrate` vs `Ads Branding (Eat/Drink/celebrate life)`). Fuzzy
  matching was rejected as worse than leaving it null. 69 rows are flagged
  `needs_review = true` for a human to map in the UI. Every row keeps
  `campaign_name` as text so nothing is lost.
- **`performance_tag` and `next_action` are empty on all 169 rows** — they were
  empty in the sheet too. 68 `Resulted` rows are worth backfilling by hand; that is
  what makes the matcher useful on day one rather than in six months.
- **Rate card terms are thin.** Price parsed for 96 cards; lead time / revisions /
  boost / gen-code fees only where the Thai phrasing was regular. The raw text is
  preserved in `notes` and every card carries `data.needs_review = true`.
- **`Phuket` is not a brand in the app.** The log's `TO_Phuket` is mapped to
  `brand = teppen`, `branch = Phuket` — confirm this is right.
- **Mainichi's branch column holds channels**, not branches (`Dine-in (EK)`,
  `Delivery (ST)`). Stored as-is rather than invented.
- Per-platform reach sums exceed the sheet's own `Total_Reach` by 0.4%; the sheet
  disagrees with itself and was not "corrected".

## Re-running

Every engagement carries `source_key = 'sheet:<T|O|M|P>:<row index>'` with a unique
index, so a re-import updates rather than duplicates. Profiles and rate cards carry
`data.source`; to unwind the whole migration:

```sql
delete from kol_collaboration_history where source_key like 'sheet:%';
delete from kol_profiles where data->>'source' like 'KOL_MASTER%';
```
(`kol_channels`, `kol_engagement_posts` and `kol_rate_cards` cascade.)
