# Pre-backfill snapshot — 2026-07-26

Project: Marketing OS (zxxpyknoymdlhckpchse)
State before `campaign_id_backfill.sql`: every row below had `campaign_id = NULL`.
`expense_requests` had no `campaign_id` column at all.

Rollback = `update public.tasks set campaign_id = null;` and the same for
`public.expense_requests`. The `campaign` text column was never modified, so
the mapping below can always be recomputed from the live table.

## tasks (85 rows, campaign_id all NULL)

Grouped by the campaign name held in the `campaign` text column:

| campaign (text) | task ids |
|---|---|
| OMD-20260901-MASTER — RESET YOUR DAY with OMD | 135,136,137,138,139,140,141,142,143,144,145,146,147,148 |
| CPN017_Mother's Day | 120,121,122,123,124,125,126,187,188,191 |
| CPN016_WHAT ARE YOU CELEBRATING TODAY? | 127,128,129,130,131,132,133,134,149 |
| CPN01 Branding Sit and done | 168,169,170,171,172,173,174,175,190 |
| OMD-20260901-002 — Central Pinklao Local Growth | 162,163,164,165,166,167,189 |
| CPN07 CTK Grand Opening Central Pinklao | 180,181,182,183,184,185,186 |
| OMD-20260901-003 — Kani Seasonal | 150,151,152,153,154,155 |
| OMD-20260901-006 — Delivery and Takeaway | 156,157,158,159,160,161 |
| CPN02 Branding Delivery | 176,177,178,179 |
| OTSUKARESAMA TIME | 196,197,198,199 |
| CPN06_CRM Loop | 193,194,195 |
| CPN013_Ads Branding (Eat/Drink/celebrate life) | 192 |
| **CPN01_KCC** (no matching campaign) | 116,117,118 |
| **CPN01_Branding_ Sit.Done** (no matching campaign) | 119 |
| **Must Eat_Kani festival** (no matching campaign) | 115 |

## expense_requests (19 rows, no campaign_id column)

| campaign (text) | expense ids |
|---|---|
| OMD-20260901-MASTER — RESET YOUR DAY with OMD | 33,34,35,36,37 |
| OMD-20260901-002 — Central Pinklao Local Growth | 41,42 |
| OMD-20260901-003 — Kani Seasonal | 38,39 |
| CPN01 Branding Sit and done | 43,44 |
| CPN07 CTK Grand Opening Central Pinklao | 46,47 |
| OMD-20260901-006 — Delivery and Takeaway | 40 |
| CPN02 Branding Delivery | 45 |
| CPN011_Lunch  Sathorn | 48 |
| CPN018_KCC (KEEP CLIMBING CLUB) | 32 |
| OTSUKARESAMA TIME | 49 |
| **CPN01_KCC** (no matching campaign) | 31 |

## Hand-mapped overrides agreed with the CMO

| campaign text | → campaign id | campaign name |
|---|---|---|
| CPN01_KCC | CAM-2026-5945 | CPN018_KCC (KEEP CLIMBING CLUB) |
| CPN01_Branding_ Sit.Done | CAM-2026-2751 | CPN01 Branding Sit and done |
| Must Eat_Kani festival | CAM-2026-4856 | OMD-20260901-003 — Kani Seasonal |

Note: expense 31 (`CPN01_KCC`) and expense 32 (`CPN018_KCC (KEEP CLIMBING CLUB)`)
both end up on CAM-2026-5945 — they were the same campaign typed two ways.
