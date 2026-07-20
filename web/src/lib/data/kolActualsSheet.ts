// Parse a "KOL_Activities" Google Sheet tab into KOL collaboration rows so KOL
// actuals filled in the sheet can be imported into Supabase
// (kol_collaboration_history), which the Monthly Branch Report reads. Header
// matching is forgiving (case / spacing / slashes / common aliases).

export interface KolSheetRow {
  campaignId: string;
  branch: string;
  kolId: string;      // kol_profiles uuid when the row was mirrored from the app
  kolName: string;
  category: string;
  followers: number;
  reach: number;
  engagement: number;
  foodCost: number;
  paidCost: number;
  postDate: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_./-]+/g, "");

const num = (v: string | undefined) => {
  if (!v) return 0;
  return Number(String(v).replace(/[฿,%]/g, "").replace(/[^\d.-]/g, "")) || 0;
};

const ALIASES: Record<string, string> = {
  campaignid: "campaignId", campaign: "campaignId",
  branch: "branch",
  kolid: "kolId",
  kolname: "kolName", name: "kolName",
  category: "category", type: "category",
  followers: "followers", follower: "followers",
  totalreach: "reach", reach: "reach",
  totalengage: "engagement", totalengagement: "engagement", engage: "engagement", engagement: "engagement",
  foodcost: "foodCost",
  paidcost: "paidCost", paid: "paidCost", fee: "paidCost",
  postdate: "postDate", visitedpostdate: "postDate",
};

export function parseKolActuals(grid: string[][]): KolSheetRow[] {
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => ALIASES[norm(h)] ?? "");
  const at = (field: string) => header.indexOf(field);
  if (at("campaignId") < 0 || at("kolName") < 0) return [];

  const rows: KolSheetRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const get = (f: string) => { const i = at(f); return i >= 0 ? cells[i] : undefined; };
    const campaignId = (get("campaignId") ?? "").trim();
    const kolName = (get("kolName") ?? "").trim();
    if (!campaignId || !kolName) continue;
    rows.push({
      campaignId,
      branch: (get("branch") ?? "").trim(),
      kolId: (get("kolId") ?? "").trim(),
      kolName,
      category: (get("category") ?? "").trim(),
      followers: num(get("followers")),
      reach: num(get("reach")),
      engagement: num(get("engagement")),
      foodCost: num(get("foodCost")),
      paidCost: num(get("paidCost")),
      postDate: (get("postDate") ?? "").trim(),
    });
  }
  return rows;
}
