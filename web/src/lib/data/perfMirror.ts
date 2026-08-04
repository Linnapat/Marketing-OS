/* Mirroring Platform Performance into the shared reporting sheet.
 *
 * Campaigns and KOL assignments already mirror out (db/sheetMirror); the ad
 * numbers that say whether any of it worked did not, so the sheet the team
 * reads had to be kept by hand beside the app.
 *
 * Rows land on the sheet's existing **Ad_Activities** tab, in its column order —
 * not a tab of our own. The sheet already joins Ad_Activities and
 * KOL_Activities back to Campaigns on campaign_id, and inventing a second
 * layout beside that would have split the reporting in two.
 *
 * The app's id is the key (decision, 28 Jul 2026). The sheet was keyed on a
 * hand-written code (CPN01) that exists for only some campaigns and for none of
 * the three whose names carry no code at all; the app's id exists for every
 * campaign and survives a rename. campaign_name rides along because nobody
 * recognises CAM-2026-4856 — the id is what a formula matches, the name is what
 * a person reads, and a row needs both to be useful.
 *
 * Pure: no fetch, no Sheet, so the column mapping is testable on its own. */

import { BrandId } from "@/lib/brands";
import { CampaignResultRow } from "@/lib/data/campaignResult";

/** The tab the team already reports from. */
export const PERF_MIRROR_TAB = "Ad_Activities";

/** Exactly the sheet's columns, in its order. Headers are only written when the
 *  tab is empty, so this must match what is already there or appended rows will
 *  sit under the wrong headings. */
export const PERF_MIRROR_HEADERS = [
  "campaign_id", "campaign_name", "target_audience", "ads", "role", "platform", "types", "KPI",
  "start", "end", "day", "reach_target", "reach_actual", "conversions", "CV%",
  "budget", "budget_actual", "CPR (เป้า)", "per_day", "CPR Actual", "vs เป้า", "status", "remark",
] as const;

/** Columns the sheet computes for itself. Sent blank on purpose: writing a
 *  value into a formula column either overwrites the formula or disagrees with
 *  the rows above it, and the sheet's own arithmetic is what the team trusts. */
export const SHEET_FORMULA_COLUMNS = ["CV%", "CPR (เป้า)", "per_day", "CPR Actual", "vs เป้า"] as const;

export interface PerfMirrorContext {
  campaignName: string;
  brand?: BrandId;
  /** Campaign flight dates, already split out of CampaignRow.dates. */
  start?: string;
  end?: string;
  syncedAt: string;
}

/** One Ad_Activities row, in PERF_MIRROR_HEADERS order. */
export function perfMirrorRow(r: CampaignResultRow, ctx: PerfMirrorContext): (string | number)[] {
  return [
    r.campaignId,          // campaign_id — the join key
    ctx.campaignName,      // campaign_name — for a human
    r.audience ?? "",      // target_audience
    r.ad ?? "",            // ads
    r.role ?? "",          // role
    r.platform ?? "",      // platform
    r.type ?? "",          // types
    r.kpi ?? "",           // KPI
    ctx.start ?? "",       // start
    ctx.end ?? "",         // end
    r.days ?? 0,           // day
    r.target ?? 0,         // reach_target
    r.reachActual ?? 0,    // reach_actual
    r.conversions ?? 0,    // conversions
    "",                    // CV%          ← sheet formula
    r.budget ?? 0,         // budget
    r.budgetActual ?? 0,   // budget_actual
    "",                    // CPR (เป้า)   ← sheet formula
    "",                    // per_day      ← sheet formula
    "",                    // CPR Actual   ← sheet formula
    "",                    // vs เป้า      ← sheet formula
    "",                    // status — owned in the sheet, not overwritten
    // The sheet has no column for store visits, so it rides in remark rather
    // than being dropped silently.
    r.marketingVisits ? `marketing_visits: ${r.marketingVisits}` : "",
  ];
}

/** Splits CampaignRow.dates ("1 Jul – 31 Jul") back into its two ends. */
export function splitDates(dates: string | undefined): { start: string; end: string } {
  const [start = "", end = ""] = (dates ?? "").split(/[–—]|(?<=\S)\s-\s(?=\S)/).map((s) => s.trim());
  return { start, end };
}

/* ── which brands leave the system ───────────────────────────────────────
 *
 * Mirroring is an export: rows go to a spreadsheet whose sharing this app does
 * not control. Which brands that happens for is a decision, not a default, so
 * it is stored rather than assumed — and "not configured yet" means every
 * brand, matching how the campaign and KOL mirrors already behave. Switching
 * them off silently would be the surprise. */

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
 *  choice: mirror nothing. That distinction is why null is allowed at all. */
export function shouldMirrorBrand(brand: BrandId | undefined, allowed: BrandId[] | null): boolean {
  if (allowed === null) return true;
  if (!brand) return false; // a row we cannot attribute must not leave by accident
  return allowed.includes(brand);
}

/** The rows that may be mirrored, paired with their campaign context. Rows
 *  whose campaign cannot be resolved are dropped rather than sent with a blank
 *  id: an unjoinable row in a reporting sheet is worse than a missing one,
 *  because the totals still count it. */
export function mirrorableRows(
  rows: CampaignResultRow[],
  campaignOf: (campaignId: string) => { name: string; brand?: BrandId; dates?: string } | undefined,
  allowed: BrandId[] | null,
  syncedAt: string,
): { row: CampaignResultRow; ctx: PerfMirrorContext }[] {
  const out: { row: CampaignResultRow; ctx: PerfMirrorContext }[] = [];
  for (const row of rows) {
    if (!row.campaignId) continue;
    const campaign = campaignOf(row.campaignId);
    if (!campaign?.name) continue;
    if (!shouldMirrorBrand(campaign.brand, allowed)) continue;
    const { start, end } = splitDates(campaign.dates);
    out.push({ row, ctx: { campaignName: campaign.name, brand: campaign.brand, start, end, syncedAt } });
  }
  return out;
}
