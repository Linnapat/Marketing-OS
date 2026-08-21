// สรุปผล KOL ตามรูปแบบรายงานเดิม (Monthly Branch Report)
//
// The team has been keeping this report in a Google Sheet: a KPI panel at the
// top, a per-branch table, and one line per creator underneath. The app had
// per-campaign totals and nothing else, so the monthly report was still being
// rebuilt by hand from numbers the app already holds.
//
// Everything here is derived from the rows on screen plus five planning inputs
// (the KPI, how many pages were planned, the requested budget, the visit rate
// and ARPU) that only ever existed in the sheet's header.
//
// Pure — see scripts/test-kol-summary.ts.

import { Kol, kolPosts, postsTotals } from "@/lib/data/kol";

/** The five numbers the sheet keeps in its header and the app never had.
 *
 *  visitRate × arpu is how the sheet estimates revenue from reach: reach ×
 *  0.002 visits × ฿800 a head. It is an ESTIMATE and named one — the real ROAS
 *  comes from `revenue` when someone records it. */
export interface SummaryTargets {
  kpiReach: number;
  pagesNeeded: number;
  budget: number;
  visitRate: number;
  arpu: number;
}

export const DEFAULT_TARGETS: SummaryTargets = {
  kpiReach: 0, pagesNeeded: 0, budget: 0,
  // The values the sheet has been using.
  visitRate: 0.002, arpu: 800,
};

export interface BranchRow {
  branch: string;
  kolUsed: number;
  reach: number;
  engage: number;
  cost: number;
  followers: number;
  /** ฿ per reach. 0 when nothing has been reported — not Infinity. */
  costPerReach: number;
  /** engage ÷ reach, as a percentage. */
  engageRate: number;
  /** reach ÷ followers: over 1 means the post travelled past their own base. */
  reachPerFollower: number;
}

export interface DetailRow {
  id: number;
  /** The library's KOL-0001 code, when the row is linked to a master profile
   *  and that profile has been numbered. The sheet's "KOL ID" column. */
  code: string;
  campaign: string;
  branch: string;
  handle: string;
  name: string;
  category: string;
  followers: number;
  status: string;
  /** วันไปร้าน / วันโพสต์ — the sheet's "Visited/Post Date" column. */
  visitDate: string;
  postDate: string;
  reach: number;
  engage: number;
  foodCost: number;
  paidCost: number;
  totalCost: number;
  costPerReach: number;
  engageRate: number;
}

export interface KolSummary {
  targets: SummaryTargets;
  kolUsed: number;
  posts: number;
  postsReported: number;
  reach: number;
  engage: number;
  cost: number;
  foodCost: number;
  paidCost: number;
  followers: number;
  costPerReach: number;
  /** engage ÷ reach × 100. NOT engage ÷ anything else — the sheet's top block
   *  reads 1033.2% for 6,736 engage on 69,595 reach, which is 9.7%; its own
   *  per-month block computes the same thing correctly at 4.2%. The correct
   *  one is here, and the app must not reproduce the broken one. */
  engageRate: number;
  reachPerFollower: number;
  /** Total cost ÷ requested budget, as a percentage. Over 100 = overspent. */
  budgetUsedPct: number;
  /** reach ÷ KPI, as a percentage. */
  kpiPct: number;
  /** Pages actually used vs planned. */
  pagesPct: number;
  /** reach × visitRate × arpu ÷ cost — the sheet's "ROAS (est.)". */
  roasEst: number;
  /** The real one, from recorded revenue. 0 when nobody has entered any. */
  roasActual: number;
  revenue: number;
  branches: BranchRow[];
  details: DetailRow[];
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const per = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/** Everything the monthly report shows, from the rows currently in view. */
export function buildKolSummary(
  rows: Kol[],
  targets: SummaryTargets,
  /** Looks up the library code for a booking. Injected rather than imported so
   *  this file stays pure and the report can be tested without a database. */
  codeFor?: (k: Kol) => string | undefined,
): KolSummary {
  const details: DetailRow[] = rows.map((k) => {
    const ps = kolPosts(k);
    const t = postsTotals(ps);
    const paidCost = k.fee || 0;
    const foodCost = k.foodCost || 0;
    // totalCost is what the row stores; older rows may not carry it.
    const totalCost = k.totalCost || paidCost + foodCost;
    return {
      id: k.id,
      code: codeFor?.(k) ?? "",
      campaign: k.campaign || "—",
      branch: (k.branch || "").trim() || "ไม่ระบุสาขา",
      handle: k.h || "",
      name: k.name,
      category: k.kolType || "",
      followers: k.followers || 0,
      status: k.status || "",
      visitDate: (k.visitDate ?? "").slice(0, 10),
      postDate: (k.postedDate ?? "").slice(0, 10),
      reach: t.reach,
      engage: t.engagement,
      foodCost, paidCost, totalCost,
      costPerReach: per(totalCost, t.reach),
      engageRate: pct(t.engagement, t.reach),
    };
  }).sort((a, b) => a.campaign.localeCompare(b.campaign) || a.name.localeCompare(b.name));

  // Branch rollup, biggest reach first — the branch that carried the month
  // should not be somewhere in the middle of an alphabetical list.
  const byBranch = new Map<string, BranchRow>();
  for (const d of details) {
    const row = byBranch.get(d.branch) ?? {
      branch: d.branch, kolUsed: 0, reach: 0, engage: 0, cost: 0, followers: 0,
      costPerReach: 0, engageRate: 0, reachPerFollower: 0,
    };
    row.kolUsed += 1;
    row.reach += d.reach;
    row.engage += d.engage;
    row.cost += d.totalCost;
    row.followers += d.followers;
    byBranch.set(d.branch, row);
  }
  const branches = [...byBranch.values()].map((b) => ({
    ...b,
    costPerReach: per(b.cost, b.reach),
    engageRate: pct(b.engage, b.reach),
    reachPerFollower: per(b.reach, b.followers),
  })).sort((a, b) => b.reach - a.reach || a.branch.localeCompare(b.branch));

  const reach = details.reduce((s, d) => s + d.reach, 0);
  const engage = details.reduce((s, d) => s + d.engage, 0);
  const cost = details.reduce((s, d) => s + d.totalCost, 0);
  const foodCost = details.reduce((s, d) => s + d.foodCost, 0);
  const paidCost = details.reduce((s, d) => s + d.paidCost, 0);
  const followers = details.reduce((s, d) => s + d.followers, 0);
  const revenue = rows.reduce((s, k) => s + (k.revenue || 0), 0);
  const posts = rows.reduce((s, k) => s + kolPosts(k).length, 0);
  const postsReported = rows.reduce(
    (s, k) => s + kolPosts(k).filter((p) => (p.reach || 0) > 0 || (p.engagement || 0) > 0).length, 0);

  return {
    targets, kolUsed: rows.length, posts, postsReported,
    reach, engage, cost, foodCost, paidCost, followers, revenue,
    costPerReach: per(cost, reach),
    engageRate: pct(engage, reach),
    reachPerFollower: per(reach, followers),
    budgetUsedPct: pct(cost, targets.budget),
    kpiPct: pct(reach, targets.kpiReach),
    pagesPct: pct(rows.length, targets.pagesNeeded),
    // Estimated revenue: every `visitRate` of the people reached walks in and
    // spends `arpu`. The sheet's own assumption, kept so the two agree.
    roasEst: per(reach * targets.visitRate * targets.arpu, cost),
    roasActual: per(revenue, cost),
    branches, details,
  };
}
