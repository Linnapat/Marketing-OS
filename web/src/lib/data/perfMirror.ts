/* Mirroring Platform Performance into a Google Sheet, one row per ad.
 *
 * Campaigns and KOL assignments already mirror out (see db/sheetMirror); the
 * numbers that say whether any of it worked did not, so the reporting sheet the
 * team actually reads had to be maintained by hand beside the app.
 *
 * Two things make a mirrored row joinable back to its campaign, and both have
 * to be on the row: the **id** is what a formula should match on, because it
 * survives a rename; the **name** is what a human reads, because nobody
 * recognises CAM-2026-4856. Carrying only one of them is how a reporting sheet
 * ends up either unreadable or unjoinable.
 *
 * Pure: no fetch, no Sheet — so the row shape and the brand filter are testable
 * and the same row is produced wherever it is sent from. */

import { BrandId } from "@/lib/brands";
import { CampaignResultRow } from "@/lib/data/campaignResult";

/** Tab this lands on, and its column order. Headers are written only when the
 *  tab is empty (see mirrorRowToSheet), so changing the order later needs the
 *  tab cleared — append rather than reorder. */
export const PERF_MIRROR_TAB = "Platform_Performance";

export const PERF_MIRROR_HEADERS = [
  "campaign_id", "campaign_name", "brand", "row_id",
  "ad", "platform", "type", "role", "audience", "kpi",
  "target", "budget_plan", "days", "cv_target_pct",
  "reach_actual", "budget_actual", "conversions", "marketing_visits",
  "synced_at",
] as const;

export interface PerfMirrorContext {
  campaignName: string;
  brand?: BrandId;
  syncedAt: string;
}

/** One sheet row, in PERF_MIRROR_HEADERS order. */
export function perfMirrorRow(r: CampaignResultRow, ctx: PerfMirrorContext): (string | number)[] {
  return [
    r.campaignId,
    ctx.campaignName,
    ctx.brand ?? "",
    r.id,
    r.ad ?? "",
    r.platform ?? "",
    r.type ?? "",
    r.role ?? "",
    r.audience ?? "",
    r.kpi ?? "",
    r.target ?? 0,
    r.budget ?? 0,
    r.days ?? 0,
    r.cvTargetPct ?? 0,
    r.reachActual ?? 0,
    r.budgetActual ?? 0,
    r.conversions ?? 0,
    r.marketingVisits ?? 0,
    ctx.syncedAt,
  ];
}

/* ── which brands leave the system ───────────────────────────────────────
 *
 * Mirroring is an export: rows go to a spreadsheet whose sharing this app does
 * not control. Which brands that happens for is a decision, not a default, so
 * it is stored rather than assumed — and the safe reading of "not configured
 * yet" is every brand, because that matches how the campaign and KOL mirrors
 * already behave and switching them off silently would be the surprise. */

export const PERF_MIRROR_BRANDS_KEY = "perf_mirror_brands";

/** Parses the stored setting. Anything unreadable means "not configured". */
export function parseMirrorBrands(raw: string | null | undefined): BrandId[] | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((b): b is BrandId => typeof b === "string" && b.trim() !== "");
  } catch {
    return null;
  }
}

/** null = not configured → mirror everything. An explicit empty list is a real
 *  choice: mirror nothing. That distinction is the whole point of allowing null. */
export function shouldMirrorBrand(brand: BrandId | undefined, allowed: BrandId[] | null): boolean {
  if (allowed === null) return true;
  if (!brand) return false; // a row we cannot attribute must not leave by accident
  return allowed.includes(brand);
}

/** The rows that may be mirrored, already paired with their campaign context.
 *  Rows whose campaign cannot be resolved are dropped rather than sent with a
 *  blank id — an unjoinable row in a reporting sheet is worse than a missing
 *  one, because it still gets counted. */
export function mirrorableRows(
  rows: CampaignResultRow[],
  campaignOf: (campaignId: string) => { name: string; brand?: BrandId } | undefined,
  allowed: BrandId[] | null,
  syncedAt: string,
): { row: CampaignResultRow; ctx: PerfMirrorContext }[] {
  const out: { row: CampaignResultRow; ctx: PerfMirrorContext }[] = [];
  for (const row of rows) {
    if (!row.campaignId) continue;
    const campaign = campaignOf(row.campaignId);
    if (!campaign?.name) continue;
    if (!shouldMirrorBrand(campaign.brand, allowed)) continue;
    out.push({ row, ctx: { campaignName: campaign.name, brand: campaign.brand, syncedAt } });
  }
  return out;
}
