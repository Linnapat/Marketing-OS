import { BrandId, brandName } from "@/lib/brands";
import { CampaignRow } from "@/lib/data/campaigns";
import { CampaignBrief } from "@/lib/data/brief";
import { ContentItem, itemPlatforms } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { Kol, kolPosts, postsTotals } from "@/lib/data/kol";
import { ExpenseLogRow, ExpenseReq } from "@/lib/db/finance";
import { Task } from "@/lib/data/tasks";
import { canonicalAdsPlatform } from "@/lib/data/financeCategories";

export const PERFORMANCE_PLATFORMS = [
  "Facebook / Instagram",
  "TikTok",
  "Google",
  "LINE Ads",
  "LINE OA",
  "Google Map",
  "KOL / Creator",
  "Other",
] as const;

export type PerformancePlatform = (typeof PERFORMANCE_PLATFORMS)[number];

export interface PlatformPerformanceRow {
  platform: PerformancePlatform;
  campaigns: string[];
  brands: BrandId[];
  plannedBudget: number;
  committed: number;
  actualSpend: number;
  contentCount: number;
  publishedContent: number;
  approvedCreatives: number;
  kolReach: number;
  kolEngagement: number;
  adsTasks: number;
  openTasks: number;
  roas: number;
  syncScore: number;
  blockers: string[];
}

export interface PlatformPerformanceSummary {
  totalBudget: number;
  totalSpend: number;
  totalContent: number;
  totalCreatives: number;
  totalReach: number;
  openTasks: number;
  avgSyncScore: number;
}

export interface PlatformPerformanceInput {
  campaigns: CampaignRow[];
  briefs: Record<string, CampaignBrief>;
  content: ContentItem[];
  graphics: Graphic[];
  kols: Kol[];
  expenseRequests: ExpenseReq[];
  expenses: ExpenseLogRow[];
  tasks: Task[];
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function normalizePerformancePlatform(value?: string | null): PerformancePlatform {
  const v = norm(value || "");
  if (!v) return "Other";
  if (/kol|creator|influencer/.test(v)) return "KOL / Creator";
  if (/line oa|broadcast|crm/.test(v)) return "LINE OA";
  if (/line/.test(v)) return "LINE Ads";
  if (/tiktok/.test(v)) return "TikTok";
  if (/google map|gmb|maps/.test(v)) return "Google Map";
  if (/google|ppc|search|youtube/.test(v)) return "Google";
  if (/facebook|instagram|meta|ig|fb|reel/.test(v)) return "Facebook / Instagram";
  return "Other";
}

const categoryPlatform = (category: string): PerformancePlatform => normalizePerformancePlatform(category);
const platformCategory = (platform: PerformancePlatform): string => {
  if (platform === "KOL / Creator") return "KOL / Influencer";
  if (platform === "LINE OA") return "LINE Broadcast";
  if (platform === "Google Map") return "Google Ads / PPC";
  return canonicalAdsPlatform(platform);
};

const uniq = <T,>(xs: T[]): T[] => Array.from(new Set(xs));
const safeRoas = (campaigns: CampaignRow[], names: string[], spend: number): number => {
  const related = campaigns.filter((c) => names.includes(c.name));
  const revenue = related.reduce((s, c) => s + Math.round((c.spend || 0) * (c.roi || 0)), 0);
  return spend > 0 ? revenue / spend : 0;
};

export function buildPlatformPerformance(input: PlatformPerformanceInput): { rows: PlatformPerformanceRow[]; summary: PlatformPerformanceSummary } {
  const rows = {} as Record<PerformancePlatform, PlatformPerformanceRow>;
  for (const platform of PERFORMANCE_PLATFORMS) {
    rows[platform] = {
      platform, campaigns: [], brands: [], plannedBudget: 0, committed: 0, actualSpend: 0,
      contentCount: 0, publishedContent: 0, approvedCreatives: 0, kolReach: 0, kolEngagement: 0,
      adsTasks: 0, openTasks: 0, roas: 0, syncScore: 0, blockers: [],
    };
  }

  const touch = (platform: PerformancePlatform, campaign?: string, brand?: BrandId) => {
    const row = rows[platform];
    if (campaign) row.campaigns.push(campaign);
    if (brand) row.brands.push(brand);
    return row;
  };

  for (const [campaignName, brief] of Object.entries(input.briefs)) {
    for (const line of brief.budget.adsByPlatform ?? []) {
      if ((line.amount || 0) <= 0) continue;
      const platform = normalizePerformancePlatform(line.platform);
      const row = touch(platform, campaignName, brief.b);
      row.plannedBudget += line.amount || 0;
      row.committed += line.amount || 0;
    }
    for (const k of brief.kols ?? []) {
      const budget = k.budget || 0;
      if (budget <= 0) continue;
      for (const p of k.platforms?.length ? k.platforms : ["KOL / Creator"]) {
        const row = touch("KOL / Creator", campaignName, brief.b);
        row.plannedBudget += budget / Math.max(1, k.platforms?.length || 1);
        row.committed += budget / Math.max(1, k.platforms?.length || 1);
      }
    }
  }

  for (const c of input.content) {
    for (const p of itemPlatforms(c)) {
      const row = touch(normalizePerformancePlatform(p), c.campaign, c.b);
      row.contentCount++;
      if (/published|scheduled|queued/i.test(c.publishStatus) || /published|scheduled/i.test(c.status)) row.publishedContent++;
    }
  }

  for (const g of input.graphics) {
    const platforms = (g.deliverables?.length ? g.deliverables.map((d) => d.platform) : [g.platform]).filter(Boolean);
    for (const p of platforms) {
      const row = touch(normalizePerformancePlatform(p), g.campaign, g.b);
      if (/approved|delivered/i.test(g.stage)) row.approvedCreatives++;
      if (g.blocker) row.blockers.push(`${g.title}: ${g.blocker}`);
    }
  }

  for (const k of input.kols) {
    const posts = kolPosts(k);
    const totals = postsTotals(posts);
    const platform = normalizePerformancePlatform(k.plat || posts[0]?.platform || "KOL");
    const row = touch(platform === "Other" ? "KOL / Creator" : platform, k.campaign, k.b);
    row.kolReach += totals.reach || k.actualReach || 0;
    row.kolEngagement += totals.engagement || k.actualEngagement || 0;
    row.committed += k.fee || 0;
    row.actualSpend += /paid/i.test(k.paymentStatus) ? (k.totalCost || k.fee || 0) : 0;
  }

  for (const req of input.expenseRequests) {
    const platform = categoryPlatform(req.category);
    const row = touch(platform, req.campaign, req.b);
    row.committed += req.approved || req.requested || 0;
  }

  for (const exp of input.expenses) {
    const platform = categoryPlatform(exp.category);
    const row = touch(platform, undefined, exp.b);
    row.actualSpend += exp.amount || 0;
  }

  for (const t of input.tasks) {
    if (t.type !== "Ads" && t.module !== "Ads" && !/ads|performance|report/i.test(t.type)) continue;
    const platform = normalizePerformancePlatform(t.channel || t.title);
    const row = touch(platform, t.campaign, undefined);
    row.adsTasks++;
    if (!/done|approved|completed/i.test(t.status)) row.openTasks++;
    if (t.blocker) row.blockers.push(`${t.title}: ${t.blocker}`);
  }

  const finalRows = Object.values(rows).map((row) => {
    row.campaigns = uniq(row.campaigns.filter(Boolean));
    row.brands = uniq(row.brands.filter(Boolean));
    row.roas = safeRoas(input.campaigns, row.campaigns, row.actualSpend || row.committed);
    const gates = [
      row.plannedBudget > 0 || row.committed > 0,
      row.contentCount > 0 || row.platform === "Google" || row.platform === "LINE Ads",
      row.approvedCreatives > 0 || row.platform === "KOL / Creator" || row.platform === "LINE OA" || row.platform === "Google Map",
      row.actualSpend > 0 || row.adsTasks > 0,
      row.openTasks === 0 && row.blockers.length === 0,
    ];
    row.syncScore = Math.round((gates.filter(Boolean).length / gates.length) * 100);
    return row;
  }).filter((row) =>
    row.plannedBudget || row.committed || row.actualSpend || row.contentCount || row.approvedCreatives || row.kolReach || row.adsTasks,
  );

  const summary: PlatformPerformanceSummary = {
    totalBudget: finalRows.reduce((s, r) => s + r.plannedBudget, 0),
    totalSpend: finalRows.reduce((s, r) => s + r.actualSpend, 0),
    totalContent: finalRows.reduce((s, r) => s + r.contentCount, 0),
    totalCreatives: finalRows.reduce((s, r) => s + r.approvedCreatives, 0),
    totalReach: finalRows.reduce((s, r) => s + r.kolReach, 0),
    openTasks: finalRows.reduce((s, r) => s + r.openTasks, 0),
    avgSyncScore: finalRows.length ? Math.round(finalRows.reduce((s, r) => s + r.syncScore, 0) / finalRows.length) : 0,
  };
  return { rows: finalRows.sort((a, b) => b.committed + b.actualSpend - (a.committed + a.actualSpend)), summary };
}

export function platformDisplay(row: PlatformPerformanceRow): string {
  const category = platformCategory(row.platform);
  return category === row.platform ? row.platform : `${row.platform} · ${category}`;
}

export const platformBrandNames = (row: PlatformPerformanceRow): string =>
  row.brands.map((b) => brandName(b)).join(", ") || "All Brands";
