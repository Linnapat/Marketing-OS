// Parse an "Ad_Actuals" Google Sheet tab into CampaignResultRow[] so ad actuals
// filled in the shared sheet can be imported into Supabase (campaign_results),
// which the reporting reads. Header matching is forgiving (case / spacing /
// common aliases); the row id is derived deterministically so re-imports upsert
// the same row instead of duplicating it (no row_id column for the team to keep).

import { CampaignResultRow, ResultKpi } from "@/lib/data/campaignResult";

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_.%-]+/g, "");

const num = (v: string | undefined) => {
  if (!v) return 0;
  return Number(String(v).replace(/[฿,%]/g, "").replace(/[^\d.-]/g, "")) || 0;
};

const kpiOf = (v: string | undefined): ResultKpi => {
  const k = (v || "").trim().toLowerCase();
  if (k.startsWith("click")) return "Click";
  if (k.startsWith("conv")) return "Conversion";
  return "Reach";
};

/** djb2 hash → short stable id, so the same sheet line always upserts one row. */
function rowId(campaignId: string, key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return `sheet-${campaignId}-${h.toString(36)}`;
}

const ALIASES: Record<string, string> = {
  campaignid: "campaignId", campaign: "campaignId",
  ad: "ad", ads: "ad", adname: "ad", creative: "ad",
  audience: "audience", targetaudience: "audience",
  role: "role", platform: "platform", type: "type", types: "type",
  kpi: "kpi",
  target: "target", reachtarget: "target", targetresult: "target",
  budget: "budget", budgetplan: "budget",
  days: "days", day: "days",
  cvtargetpct: "cvTargetPct", cvtarget: "cvTargetPct", cvpct: "cvTargetPct", cv: "cvTargetPct",
  reachactual: "reachActual", reach: "reachActual", actualreach: "reachActual",
  budgetactual: "budgetActual", spend: "budgetActual", actualspend: "budgetActual",
  conversions: "conversions", conversion: "conversions", conv: "conversions",
};

export function parseAdActuals(grid: string[][]): CampaignResultRow[] {
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => ALIASES[norm(h)] ?? "");
  const at = (field: string) => header.indexOf(field);
  if (at("campaignId") < 0) return [];

  const now = new Date().toISOString();
  const rows: CampaignResultRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const get = (f: string) => { const i = at(f); return i >= 0 ? cells[i] : undefined; };
    const campaignId = (get("campaignId") ?? "").trim();
    if (!campaignId) continue;

    const ad = (get("ad") ?? "").trim();
    const platform = (get("platform") ?? "").trim() || "FB/IG";
    const type = (get("type") ?? "").trim() || "Reels";
    rows.push({
      id: rowId(campaignId, `${ad}|${platform}|${type}`),
      campaignId,
      ad,
      audience: (get("audience") ?? "").trim(),
      role: (get("role") ?? "").trim() || "Awareness",
      platform,
      type,
      kpi: kpiOf(get("kpi")),
      target: num(get("target")),
      budget: num(get("budget")),
      days: num(get("days")) || 1,
      cvTargetPct: num(get("cvTargetPct")),
      reachActual: num(get("reachActual")),
      budgetActual: num(get("budgetActual")),
      conversions: num(get("conversions")),
      updatedAt: now,
      source: "sheet",
    });
  }
  return rows;
}
