// Campaigns — data shape plus detail derivations (objective/target/offer maps,
// budget lines, KPI targets, readiness, module links).
//
// Important: keep the seed list empty for production readiness. Live campaigns
// must come from Supabase / the campaign builder, not demo rows. This prevents
// cleared demo campaigns from reappearing in Settings, Campaigns, Finance,
// Platform Performance, or the admin seed endpoint.

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

const RAW: Omit<CampaignRow, "id">[] = [];

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

/** Campaign states that mean "the CMO has not cleared this yet", or that it is
 *  no longer live work.
 *
 *  The team's flow (confirmed 2026-07-30) is: Marketing briefs → CMO approves →
 *  only then does work reach Creative. Nothing enforced the middle step, and it
 *  had already leaked: 12 graphic requests and 11 posts existed under campaigns
 *  still sitting in Draft or Waiting for Approval, so Creative could start —
 *  and bill time to — work that had not been signed off, and that a rejection
 *  or a budget change would throw away.
 *
 *  Named as a BLOCK list rather than an allow list on purpose. Planning states
 *  are a closed, known set; the running states are not (Active, In Progress,
 *  Paused, Completed…, and whatever gets added next). Blocking by default would
 *  mean a new status silently freezing the whole Creative queue, which is a
 *  worse failure here than the status quo it replaces. */
const PRE_APPROVAL_STATUSES = new Set([
  "Draft", "Planning", "Ready for Review",
  "Waiting for Approval", "Waiting Approval", "Need Revision",
  "Cancelled",
]);

/** May Creative start producing for this campaign — i.e. press "รับงาน"?
 *
 *  Deliberately gates STARTING, not planning. Marketing may still raise briefs
 *  and plan posts against an unapproved campaign (that is how a campaign gets
 *  ready to be approved); what waits is the moment someone commits hours to it.
 *  Missing status is treated as not-released: a request whose campaign cannot be
 *  found should not quietly behave as approved. */
export function campaignReleasedForWork(status: string | null | undefined): boolean {
  const s = (status ?? "").trim();
  if (!s) return false;
  return !PRE_APPROVAL_STATUSES.has(s);
}

/** Does this campaign belong in MY approvals queue?
 *
 *  The queue used to ask "is the status pending?" and nothing else, so every
 *  brand-visible campaign in flight landed in everyone's inbox — including
 *  designers, who cannot approve one. The two pending statuses wait on
 *  different people, and neither waits on the whole company:
 *
 *    Waiting for Approval → the CMO decides (canApprove, from roleGates'
 *                           canApproveCampaign — the same gate the Approve
 *                           button on the campaign page asks)
 *    Ready for Review     → nobody approves it; it is the OWNER's to submit
 *
 *  Fail-closed on a blank `me`: while the member row is still loading, viewAs
 *  is "" and an owner-less campaign would otherwise match it and show up in a
 *  queue belonging to nobody. */
export function campaignAwaitsMe(
  c: Pick<CampaignRow, "status" | "owner">,
  opts: { canApprove: boolean; me: string },
): boolean {
  const status = (c.status ?? "").trim();
  if (status === "Waiting for Approval") return opts.canApprove;
  if (status !== "Ready for Review") return false;
  const me = (opts.me ?? "").trim();
  return !!me && (c.owner ?? "").trim() === me;
}

export const STATUS_ORDER = [
  "Active", "In Progress",
  "Paused", "Inactive",
  // Campaign Brief workflow statuses (from the builder) — must be listed here or
  // campaigns in these states have no group to render in on the list.
  "Ready for Review", "Waiting for Approval", "Need Revision", "Approved",
  "Waiting Approval", "Planning", "Draft", "Completed", "Cancelled",
];

// ── Per-brand brief maps (verbatim from the design) ──────────────────
const OBJ: Record<BrandId, string> = { teppen: "New Visit", omakase: "Awareness", mainichi: "CRM / LINE Coupon", touka: "Sales Conversion" };
const TARGET: Record<BrandId, string> = { teppen: "BKK diners 28–45", omakase: "Omakase enthusiasts", mainichi: "Office workers · lunch", touka: "After-work crowd" };
const OFFER: Record<BrandId, string> = { teppen: "Premium Wagyu set · seasonal pricing", omakase: "Omakase experience · private dining", mainichi: "Lunch set from ฿189", touka: "Cocktail hour 5–8PM · 1 free drink" };
const MSG: Record<BrandId, string> = { teppen: "Taste the finest Japanese beef in Bangkok", omakase: "Every meal tells a story", mainichi: "Daily lunch, elevated", touka: "Where flavour meets ambiance" };
const REACH: Record<BrandId, string> = { teppen: "580K", omakase: "1.5M", mainichi: "95K", touka: "720K" };
const VISIT_TARGET: Record<BrandId, string> = { teppen: "800 covers", omakase: "200 seatings", mainichi: "1,200 covers", touka: "500 guests" };
const ADS_BY_BRAND: Record<BrandId, string> = { teppen: "Meta Ads + Google + TikTok", omakase: "Meta Ads + LINE Ads", mainichi: "LINE Broadcast + TikTok", touka: "Meta Ads + Google" };

/** These maps only cover the four seed brands. A brand the team added in Settings
 *  has no entry, so read through this — otherwise the brief renders `undefined`. */
const copy = (map: Record<BrandId, string>, b: BrandId, fallback = "—") => map[b] ?? fallback;

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
    objective: copy(OBJ, c.b, "Awareness"),
    target: copy(TARGET, c.b),
    offer: copy(OFFER, c.b),
    keyMessage: copy(MSG, c.b),
    reach: copy(REACH, c.b),
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
    // Only the real total — bucket lines come from the campaign's brief (see
    // BudgetTab); fabricating a % split here misled Finance.
    budgetLines: [
      { label: "Total Planning Budget", value: baht(c.budget, { compact: true }) },
    ],
    kpiChips: ["Visit +20%", "ROAS ≥ 3.0×", c.roi > 0 ? `Actual: ${c.roi}×` : "ROI pending"],
    kpiRows: [
      { label: "VISIT TARGET", value: copy(VISIT_TARGET, c.b) },
      { label: "SALES TARGET", value: baht(Math.round(c.budget * 3), { compact: true }) },
      { label: "REACH TARGET", value: copy(REACH, c.b) },
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
      { icon: "📢", label: "Ads Plan", sub: copy(ADS_BY_BRAND, c.b, "Meta Ads"), status: hasReq ? "Budget OK" : "Pending", tone: hasReq ? "green" : "neutral", iconBg: mib("#EEF1F8") },
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
  "overview", "brief", "content", "kol",
  "ads", "budget", "assets", "approval", "result",
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number];
export const CAMPAIGN_TAB_LABELS: Record<CampaignTab, string> = {
  overview: "Overview", brief: "Brief", content: "Content", kol: "KOL",
  ads: "Ads", budget: "Budget", assets: "Assets", approval: "Approval", result: "Result / Report",
};

// ── Monthly summary (dark card above the list) ────────────────────────
export function monthlySummary(brandFilter: BrandId | "all", list: CampaignRow[] = CAMPAIGNS) {
  const camps = list.filter((c) => brandFilter === "all" || c.b === brandFilter);
  const budget = camps.reduce((s, c) => s + c.budget, 0);
  const spend = camps.reduce((s, c) => s + c.spend, 0);
  // Revenue only from campaigns with a real ROI — no fabricated multiplier.
  const rev = camps.reduce((s, c) => s + (c.roi > 0 && c.spend > 0 ? c.spend * c.roi : 0), 0);
  const gp = Math.round(rev * 0.38);
  const roiCamps = camps.filter((c) => c.roi > 0 && c.spend > 0);
  const avgRoas = roiCamps.length ? roiCamps.reduce((s, c) => s + c.roi, 0) / roiCamps.length : 0;
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
    roas: avgRoas > 0 ? `${avgRoas.toFixed(1)}×` : "—",
    roasColor: avgRoas >= 3 ? "#7DC87D" : avgRoas >= 2 ? "#E8C87D" : avgRoas > 0 ? "#F4A080" : "#9A9387",
    count: camps.length,
    activeCount: camps.filter((c) => ["Active", "In Progress"].includes(c.status)).length,
    bars: bars.map((b) => ({ ...b, budgetF: baht(b.budget, { compact: true }), barW: Math.round((b.budget / maxB) * 100) })),
  };
}
