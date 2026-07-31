# Pre-cleanup snapshot — 2026-07-31

Project: Marketing OS (zxxpyknoymdlhckpchse)
State before `campaign_code_cleanup.sql`.

Two numbers were showing for the same campaign: the app's per-brand running code
(`TPN-2026-002`) and a hand-written code the team typed into the campaign *name*
(`CPN010_Seasonal menu`). This migration keeps one number visible — the app's —
and preserves the hand-written one as `data.legacyCode` so old sheets and
conversations can still be traced.

## 1. Campaigns with no code at all (created 15 Jul, before the code feature)

Numbers continue the TEPPEN sequence in creation order (TPN-2026-005 was the
highest before this).

| id | name | → code |
|---|---|---|
| CAM-2026-5945 | CPN018_KCC (KEEP CLIMBING CLUB) | TPN-2026-006 |
| CAM-2026-5818 | CPN017_Mother's Day | TPN-2026-007 |
| CAM-2026-5702 | CPN016_WHAT ARE YOU CELEBRATING TODAY? | TPN-2026-008 |

## 2. Names, exactly as they were (rollback source of truth)

| id | old name | → new name | legacyCode |
|---|---|---|---|
| CAM-2026-9148 | `CPN05_Fuji Don (USP)` | Fuji Don (USP) | CPN05 |
| CAM-2026-2981 | `CPN06_CRM Loop` | CRM Loop | CPN06 |
| CAM-2026-7516 | `MS_Delivery ` | MS_Delivery | — (trailing space only) |
| CAM-2026-2751 | `CPN01 Branding Sit and done` | Branding Sit and done | CPN01 |
| CAM-2026-4008 | `CPN02 Branding Delivery` | Branding Delivery | CPN02 |
| CAM-2026-9285 | `CPN07 CTK Grand Opening Central Pinklao` | CTK Grand Opening Central Pinklao | CPN07 |
| CAM-2026-5702 | `CPN016_WHAT ARE YOU CELEBRATING TODAY?` | WHAT ARE YOU CELEBRATING TODAY? | CPN016 |
| CAM-2026-5945 | `CPN018_KCC (KEEP CLIMBING CLUB)` | KCC (KEEP CLIMBING CLUB) | CPN018 |
| CAM-2026-5818 | `CPN017_Mother's Day` | Mother's Day | CPN017 |
| CAM-2026-7028 | `CPN011_Lunch  Sathorn ` | Lunch Sathorn | CPN011 |
| CAM-2026-4770 | `CPN010_Seasonal menu` | Seasonal menu | CPN010 |
| CAM-2026-3134 | `CPN013_Ads Branding (Eat/Drink/celebrate life)` | Ads Branding (Eat/Drink/celebrate life) | CPN013 |

`CAM-2026-7516` has no CPN prefix — `MS_` is part of the name and stays. Only its
trailing space is trimmed.

## 3. Denormalised name copies updated alongside

Every module keeps its own `campaign` text column beside `campaign_id`, and the
Content / Graphic / Task lists render that text — leaving it behind would show
the old name next to the new one. Rows touched:

| table | rows | matched by |
|---|---|---|
| tasks | 82 | campaign_id, or old name where campaign_id is null (24 rows have none) |
| content_posts | 32 | campaign_id |
| graphic_requests | 29 | campaign_id |
| kols | 26 | campaign_id |
| expense_requests | 19 | campaign_id, or old name (1 row has none) |
| requests | 3 | campaign_id |
| agency_tasks | 0 | — |
| assets | 0 | name only (no campaign_id column) |

`campaigns.data->>'name'` matched `campaigns.name` on all 21 rows before the
change and is updated in the same statement, so the brief keeps agreeing with
the row.

## Rollback

`campaign_code_cleanup_rollback.sql` restores every name in table 2 from this
file and drops the `code` / `legacyCode` keys added here. The `CAM-` ids never
change, so all foreign keys survive either direction.

## Not done here

- **No unique constraint on (brand, code).** `nextCampaignCode()` still computes
  the next number in the browser when the form opens, so two people creating a
  campaign for the same brand at the same time can still land on the same code,
  and deleting a campaign frees its number for reuse.
- **The `OMD-20260901-xxx` prefix in six Omakase Don names is untouched** — it is
  the same kind of hand-written code as CPN and reads even closer to the app's
  own `OMD-2026-xxx`, but it was out of scope for this pass.
