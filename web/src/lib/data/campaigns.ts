// Campaigns — ported from Campaign.dc.html. Raw list plus the detail derivations the
// design computes per campaign (objective/target/offer maps, budget lines, KPI targets,
// readiness, module links). Shaped so a Supabase `campaigns` table can replace RAW later.

import { BrandId, brandColor, brandName } from "@/lib/brands";
import { baht } from "@/lib/format";
import { Tone } from "@/lib/status";

export type Readiness = "ready" | "needs_attention" | "blocked";

export interface CampaignRow {
  id: string; // campaign_id, e.g. CAM-2026-0001
  name: string;
  b: BrandId;
  branch: string;
  owner: string;
  budget: number;
  spend: number;
  roi: number;
  dates: string;
  status: string;
  campType: string;
  readiness: Readiness;
  taskBlocked: number;
  taskWaiting: number;
  taskOverdue: number;
  taskTotal: number;
  taskDone: number;
  taskInProgress: number;
  bottleneckTeam: string;
  nextApproval: string;
}

const RAW: Omit<CampaignRow, "id">[] = [
  { name: "Songkran Teppanyaki", b: "teppen", branch: "Thonglor", owner: "Aran P.", budget: 270000, spend: 320000, roi: 2.8, dates: "Apr 1 – Apr 30", status: "Active", campType: "Online + Offline", readiness: "needs_attention", taskBlocked: 2, taskWaiting: 1, taskOverdue: 1, taskTotal: 14, taskDone: 8, taskInProgress: 4, bottleneckTeam: "Graphic Team", nextApproval: "CMO" },
  { name: "Wagyu Festival", b: "teppen", branch: "EmQuartier", owner: "Mei T.", budget: 450000, spend: 280000, roi: 3.4, dates: "Jun 1 – Jul 15", status: "Active", campType: "Online + Offline", readiness: "ready", taskBlocked: 0, taskWaiting: 1, taskOverdue: 0, taskTotal: 18, taskDone: 14, taskInProgress: 3, bottleneckTeam: "None", nextApproval: "None" },
  { name: "Summer Reel Series", b: "omakase", branch: "Siam Paragon", owner: "Ken S.", budget: 180000, spend: 60000, roi: 0, dates: "Jun 20 – Jul 20", status: "In Progress", campType: "Online Only", readiness: "needs_attention", taskBlocked: 1, taskWaiting: 2, taskOverdue: 0, taskTotal: 10, taskDone: 4, taskInProgress: 4, bottleneckTeam: "Design Team", nextApproval: "Brand Manager" },
  { name: "Father's Day Set", b: "omakase", branch: "Central World", owner: "Ken S.", budget: 120000, spend: 95000, roi: 3.6, dates: "Jun 10 – Jun 30", status: "Active", campType: "Online Only", readiness: "ready", taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 9, taskDone: 9, taskInProgress: 0, bottleneckTeam: "None", nextApproval: "None" },
  { name: "Rainy Season Promo", b: "mainichi", branch: "Icon Siam", owner: "Nok W.", budget: 90000, spend: 0, roi: 0, dates: "Jul 1 – Jul 31", status: "Waiting Approval", campType: "CRM / LINE", readiness: "blocked", taskBlocked: 3, taskWaiting: 2, taskOverdue: 0, taskTotal: 8, taskDone: 0, taskInProgress: 2, bottleneckTeam: "Budget", nextApproval: "CFO" },
  { name: "LINE Coupon Drive", b: "mainichi", branch: "Thonglor", owner: "Nok W.", budget: 60000, spend: 58000, roi: 0.8, dates: "May 1 – May 31", status: "Completed", campType: "CRM / LINE", readiness: "ready", taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 12, taskDone: 12, taskInProgress: 0, bottleneckTeam: "None", nextApproval: "None" },
  { name: "Cocktail Hour Launch", b: "touka", branch: "Thonglor", owner: "Ploy R.", budget: 150000, spend: 35000, roi: 4.1, dates: "Jun 15 – Aug 1", status: "Active", campType: "Online + Offline", readiness: "needs_attention", taskBlocked: 1, taskWaiting: 1, taskOverdue: 1, taskTotal: 15, taskDone: 10, taskInProgress: 3, bottleneckTeam: "Content Team", nextApproval: "CMO" },
  { name: "Omakase Tasting Menu", b: "omakase", branch: "EmQuartier", owner: "Ken S.", budget: 200000, spend: 0, roi: 0, dates: "Jul 10 – Aug 10", status: "Draft", campType: "Offline Only", readiness: "needs_attention", taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 3, taskDone: 0, taskInProgress: 1, bottleneckTeam: "None", nextApproval: "CMO" },
  { name: "Golden Week Teaser", b: "teppen", branch: "Siam Paragon", owner: "Mei T.", budget: 100000, spend: 100000, roi: 2.2, dates: "Apr 28 – May 6", status: "Completed", campType: "Online Only", readiness: "ready", taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 10, taskDone: 10, taskInProgress: 0, bottleneckTeam: "None", nextApproval: "None" },
  { name: "Touka Anniversary", b: "touka", branch: "Central World", owner: "Ploy R.", budget: 130000, spend: 0, roi: 0, dates: "Aug 1 – Aug 31", status: "Draft", campType: "Event / Store Activation", readiness: "blocked", taskBlocked: 1, taskWaiting: 0, taskOverdue: 0, taskTotal: 4, taskDone: 0, taskInProgress: 0, bottleneckTeam: "Brief", nextApproval: "CMO" },
];

export const CAMPAIGNS: CampaignRow[] = RAW.map((c, i) => ({
  ...c,
  id: `CAM-2026-${String(i + 1).padStart(4, "0")}`,
}));

export function getCampaign(id: string): CampaignRow | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

export const READINESS_META: Record<Readiness, { label: string; tone: Tone }> = {
  ready: { label: "✓ Ready", tone: "green" },
  needs_attention: { label: "⚠ Needs attention", tone: "gold" },
  blocked: { label: "⛔ Blocked", tone: "red" },
};

export const STATUS_ORDER = ["Active", "In Progress", "Waiting Approval", "Planning", "Draft", "Completed", "Cancelled"];

// ── Per-brand brief maps (verbatim from the design) ──────────────────
const OBJ: Record<BrandId, string> = { teppen: "New Visit", omakase: "Awareness", mainichi: "CRM / LINE Coupon", touka: "Sales Conversion" };
const TARGET: Record<BrandId, string> = { teppen: "BKK diners 28–45", omakase: "Omakase enthusiasts", mainichi: "Office workers · lunch", touka: "After-work crowd" };
const OFFER: Record<BrandId, string> = { teppen: "Premium Wagyu set · seasonal pricing", omakase: "Omakase experience · private dining", mainichi: "Lunch set from ฿189", touka: "Cocktail hour 5–8PM · 1 free drink" };
const MSG: Record<BrandId, string> = { teppen: "Taste the finest Japanese beef in Bangkok", omakase: "Every meal tells a story", mainichi: "Daily lunch, elevated", touka: "Where flavour meets ambiance" };
const REACH: Record<BrandId, string> = { teppen: "580K", omakase: "1.5M", mainichi: "95K", touka: "720K" };
const VISIT_TARGET: Record<BrandId, string> = { teppen: "800 covers", omakase: "200 seatings", mainichi: "1,200 covers", touka: "500 guests" };
const ADS_BY_BRAND: Record<BrandId, string> = { teppen: "Meta Ads + Google + TikTok", omakase: "Meta Ads + LINE Ads", mainichi: "LINE Broadcast + TikTok", touka: "Meta Ads + Google" };

export interface CampaignDetail {
  row: CampaignRow;
  color: string;
  brand: string;
  objective: string;
  target: string;
  offer: string;
  keyMessage: string;
  reach: string;
  revenue: string;
  budgetF: string;
  spendF: string;
  roiF: string;
  roiColor: string;
  hasResult: boolean;
  needsResult: boolean;
  periodRows: { label: string; value: string }[];
  budgetLines: { label: string; value: string }[];
  kpiChips: string[];
  kpiRows: { label: string; value: string }[];
  readinessItems: { label: string; icon: string; color: string }[];
  moduleLinks: { icon: string; label: string; sub: string; status: string; tone: Tone; iconBg: string }[];
  channelOnline: Channel[];
  channelOffline: Channel[];
  channelSupport: Channel[];
  bottleneckItems: { team: string; issue: string; severity: string; tone: Tone }[];
  hasBottlenecks: boolean;
}

interface Channel { name: string; status: string; icon: string; bg: string; fg: string; }

export function deriveDetail(c: CampaignRow): CampaignDetail {
  const hasResult = c.spend > 0 && c.roi > 0;
  const [start, end] = c.dates.split(" – ");
  const roiColor = !c.roi ? "#9A9387" : c.roi < 1.5 ? "#C68A1E" : "#4E7A4E";
  // Simplified linkage checks (in the real app these hit sibling tables).
  const hasContent = ["Active", "In Progress"].includes(c.status);
  const hasKol = c.b === "teppen" || c.b === "touka";
  const hasReq = c.spend > 0 || c.status === "Waiting Approval";
  const hasReport = c.status === "Completed";
  const mib = (bg: string) => bg;

  return {
    row: c,
    color: brandColor(c.b),
    brand: brandName(c.b),
    objective: OBJ[c.b],
    target: TARGET[c.b],
    offer: OFFER[c.b],
    keyMessage: MSG[c.b],
    reach: REACH[c.b],
    revenue: c.roi ? baht(Math.round(c.spend * c.roi), { compact: true }) : "—",
    budgetF: baht(c.budget, { compact: true }),
    spendF: c.spend ? baht(c.spend, { compact: true }) : "—",
    roiF: c.roi ? `${c.roi}×` : "—",
    roiColor,
    hasResult,
    needsResult: c.status === "Completed" && !hasReport ? true : false,
    periodRows: [
      { label: "START DATE", value: start ?? "—" },
      { label: "END DATE", value: end ?? "—" },
      { label: "PUBLISH START", value: start ?? "—" },
    ],
    budgetLines: [
      { label: "Total Planning Budget", value: baht(c.budget, { compact: true }) },
      { label: "Content Budget", value: baht(Math.round(c.budget * 0.1), { compact: true }) },
      { label: "KOL Budget", value: baht(Math.round(c.budget * 0.2), { compact: true }) },
      { label: "Ads Budget", value: baht(Math.round(c.budget * 0.4), { compact: true }) },
      { label: "Production Budget", value: baht(Math.round(c.budget * 0.15), { compact: true }) },
    ],
    kpiChips: ["Visit +20%", "ROAS ≥ 3.0×", c.roi > 0 ? `Actual: ${c.roi}×` : "ROI pending"],
    kpiRows: [
      { label: "VISIT TARGET", value: VISIT_TARGET[c.b] },
      { label: "SALES TARGET", value: baht(Math.round(c.budget * 3), { compact: true }) },
      { label: "REACH TARGET", value: REACH[c.b] },
      { label: "ROAS TARGET", value: "3.0×" },
    ],
    readinessItems: [
      { label: "Content Plan", icon: hasContent ? "✓" : "—", color: hasContent ? "#4E7A4E" : "#9A9387" },
      { label: "KOL Plan", icon: hasKol ? "✓" : "—", color: hasKol ? "#4E7A4E" : "#9A9387" },
      { label: "Ads Budget", icon: hasReq ? "✓" : "⚠", color: hasReq ? "#4E7A4E" : "#C68A1E" },
      { label: "Artwork", icon: "✓", color: "#4E7A4E" },
      { label: "Result Report", icon: hasReport ? "✓" : "—", color: hasReport ? "#4E7A4E" : "#9A9387" },
    ],
    moduleLinks: [
      { icon: "📝", label: "Content Calendar", sub: hasContent ? "Posts planned" : "No posts yet", status: hasContent ? "Planned" : "Missing", tone: hasContent ? "green" : "gold", iconBg: mib("#EEF4EE") },
      { icon: "🤝", label: "KOL Plan", sub: hasKol ? "Creators assigned" : "No KOL assigned", status: hasKol ? "Active" : "Missing", tone: hasKol ? "green" : "gold", iconBg: mib("#FBF6ED") },
      { icon: "📢", label: "Ads Plan", sub: ADS_BY_BRAND[c.b], status: hasReq ? "Budget OK" : "Pending", tone: hasReq ? "green" : "neutral", iconBg: mib("#EEF1F8") },
      { icon: "🎨", label: "Graphic / Asset", sub: "Artwork in progress", status: "In Progress", tone: "blue", iconBg: mib("#F2EDE2") },
      { icon: "✅", label: "Approval Queue", sub: hasReq ? "Budget request submitted" : "No approval pending", status: hasReq ? "Pending" : "None", tone: hasReq ? "gold" : "neutral", iconBg: mib("#FBF3F1") },
      { icon: "📊", label: "Result / Report", sub: hasReport ? "Report available" : "Report pending", status: hasReport ? "Done" : "Pending", tone: hasReport ? "ink" : "neutral", iconBg: mib("#EEF4EE") },
    ],
    channelOnline: [
      { name: "Instagram", status: hasContent ? "Ready" : "Draft", icon: "IG", bg: "#E1306C", fg: "#fff" },
      { name: "TikTok", status: "In progress", icon: "TK", bg: "#010101", fg: "#fff" },
      { name: "Facebook", status: "In progress", icon: "FB", bg: "#1877F2", fg: "#fff" },
    ],
    channelOffline: [
      { name: "In-Store Signage", status: "Ready", icon: "📍", bg: "#F2EDE2", fg: "#6b6258" },
      { name: "Flyer", status: c.campType.includes("Offline") ? "Ready" : "Not needed", icon: "🗂", bg: "#F2EDE2", fg: "#6b6258" },
    ],
    channelSupport: [
      { name: "LINE OA", status: hasContent ? "Scheduled" : "Draft", icon: "LN", bg: "#06C755", fg: "#fff" },
      { name: "Google Map", status: "Completed", icon: "GM", bg: "#4285F4", fg: "#fff" },
    ],
    hasBottlenecks: c.taskBlocked > 0 || c.taskOverdue > 0,
    bottleneckItems: (c.taskBlocked > 0 || c.taskOverdue > 0)
      ? [
          { team: c.bottleneckTeam, issue: `${c.taskBlocked} task(s) blocked`, severity: "Blocked", tone: "red" as Tone },
          { team: "All Teams", issue: `${c.taskOverdue} task(s) overdue`, severity: "Overdue", tone: "gold" as Tone },
        ]
      : [],
  };
}

export const CAMPAIGN_TABS = [
  "overview", "brief", "planner", "content", "kol",
  "ads", "budget", "assets", "approval", "result",
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number];
export const CAMPAIGN_TAB_LABELS: Record<CampaignTab, string> = {
  overview: "Overview", brief: "Brief", planner: "Planner", content: "Content", kol: "KOL",
  ads: "Ads", budget: "Budget", assets: "Assets", approval: "Approval", result: "Result / Report",
};

// ── Monthly summary (dark card above the list) ────────────────────────
export function monthlySummary(brandFilter: BrandId | "all") {
  const camps = CAMPAIGNS.filter((c) => brandFilter === "all" || c.b === brandFilter);
  const budget = camps.reduce((s, c) => s + c.budget, 0);
  const spend = camps.reduce((s, c) => s + c.spend, 0);
  const rev = camps.reduce((s, c) => s + (c.roi > 0 && c.spend > 0 ? c.spend * c.roi : c.budget * 2.8), 0);
  const gp = Math.round(rev * 0.38);
  const roiCamps = camps.filter((c) => c.roi > 0);
  const avgRoas = roiCamps.length ? roiCamps.reduce((s, c) => s + c.roi, 0) / roiCamps.length : 2.8;
  const bars = (["teppen", "omakase", "mainichi", "touka"] as BrandId[]).map((k) => ({
    id: k,
    name: brandName(k),
    color: brandColor(k),
    budget: camps.filter((c) => c.b === k).reduce((s, c) => s + c.budget, 0),
  }));
  const maxB = Math.max(...bars.map((b) => b.budget), 1);
  return {
    budget: baht(budget, { compact: true }),
    spend: baht(spend, { compact: true }),
    spendPct: budget ? Math.round((spend / budget) * 100) : 0,
    revenue: baht(Math.round(rev), { compact: true }),
    gp: baht(gp, { compact: true }),
    roas: `${avgRoas.toFixed(1)}×`,
    roasColor: avgRoas >= 3 ? "#7DC87D" : avgRoas >= 2 ? "#E8C87D" : "#F4A080",
    count: camps.length,
    activeCount: camps.filter((c) => ["Active", "In Progress"].includes(c.status)).length,
    bars: bars.map((b) => ({ ...b, budgetF: baht(b.budget, { compact: true }), barW: Math.round((b.budget / maxB) * 100) })),
  };
}
