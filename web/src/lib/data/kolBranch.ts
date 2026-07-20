// KOL collaboration → per-branch rollup ("Monthly Branch Report").
// One collaboration row = one KOL post on a campaign. Branch comes from the
// row itself (data.branch) and falls back to the campaign's branch at read
// time, so a single campaign can still split across branches.

export interface KolCollabRow {
  collabId: string;
  kolId: string;
  kolName: string;
  campaignId: string;
  brand: string;
  branch: string;
  category: string;
  followers: number;
  reach: number;
  engagement: number;
  feePaid: number;
  foodCost: number;
  totalCost: number; // feePaid + foodCost
  postDate: string;
  status: string;
}

export interface KolBranchAgg {
  branch: string;
  kolUsed: number;
  reach: number;
  engagement: number;
  cost: number;
  followers: number;
  costPerReach: number | null;   // cost / reach
  engageRate: number | null;     // engagement / reach
  reachPerFollow: number | null; // reach / followers
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function kolBranchReport(rows: KolCollabRow[]): KolBranchAgg[] {
  const map = new Map<string, KolBranchAgg>();
  for (const row of rows) {
    const branch = (row.branch || "").trim() || "ไม่ระบุสาขา";
    const group = map.get(branch) ?? {
      branch, kolUsed: 0, reach: 0, engagement: 0, cost: 0, followers: 0,
      costPerReach: null, engageRate: null, reachPerFollow: null,
    };
    group.kolUsed += 1;
    group.reach += row.reach || 0;
    group.engagement += row.engagement || 0;
    group.cost += row.totalCost || 0;
    group.followers += row.followers || 0;
    map.set(branch, group);
  }
  return Array.from(map.values())
    .map((group) => ({
      ...group,
      costPerReach: div(group.cost, group.reach),
      engageRate: div(group.engagement, group.reach),
      reachPerFollow: div(group.reach, group.followers),
    }))
    .sort((a, b) => b.cost - a.cost);
}
