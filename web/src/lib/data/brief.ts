// Flexible Campaign Brief model — NOT a fixed template. The Planner composes a
// brief freely; a guideline checklist tracks real fields; content/KOL/budget
// drive auto-generated graphics and tasks. Submit enforces a required-field set;
// Save Draft does not.

import { BrandId, brandCode } from "@/lib/brands";

// ── Option sets ───────────────────────────────────────────────────────────
export const OBJECTIVES = [
  "Awareness", "New Customer", "Repeater", "CRM", "Delivery",
  "Store Visit", "Launch", "Seasonal", "Brand Campaign",
] as const;

// Campaign Type is distinct from Objective (how it runs vs. what it's for).
export const CAMPAIGN_TYPES = [
  "Online + Offline", "Online Only", "Offline Only", "CRM / LINE",
  "Event / Store Activation", "Seasonal Promotion", "Always-on", "Product Launch",
] as const;

export const SUCCESS_METRICS = [
  "Visit", "Reach", "Engagement", "CV%", "New Member", "Repeater",
  "ROAS", "Coupon Used", "Booking", "Sales",
] as const;

export const CONTENT_TYPES = [
  "Photo", "Reel", "Short Video", "Carousel", "Story",
  "Photo album", "Photo shoot", "VDO shooting",
  "LINE Rich Message", "Poster", "Menu Insert", "POSM",
  "Menu book", "Artwork", "Mock up", "Packaging",
] as const;

export const CONTENT_PLATFORMS = [
  "Facebook", "Instagram", "TikTok", "LINE OA", "Google Business Profile", "In-store",
] as const;

// Platform → available asset sizes. The Content Plan filters the Asset Size
// dropdown to the selected platform's list, and Submit requires one per item.
export const ASSET_SIZES: Record<string, string[]> = {
  Facebook: ["1:1 (1080×1080)", "4:5 (1080×1350)", "16:9 (1200×628)", "9:16 Story (1080×1920)"],
  Instagram: ["1:1 (1080×1080)", "4:5 (1080×1350)", "9:16 Reel/Story (1080×1920)"],
  TikTok: ["9:16 (1080×1920)"],
  "LINE OA": ["Rich Message 1040×1040", "Rich Message 1040×520", "Card 1200×628"],
  "Google Business Profile": ["1:1 (720×720)", "4:3 (1200×900)", "16:9 (1200×675)"],
  "In-store": ["A4 Poster", "A3 Poster", "Table Tent", "POSM Custom"],
};
export const assetSizesFor = (platform: string): string[] => ASSET_SIZES[platform] ?? [];

export const KOL_TYPES = [
  "Foodie", "Lifestyle", "Office Worker", "Japanese Food", "Family", "Micro", "Nano", "Macro",
] as const;

export const KOL_PLATFORMS = ["Instagram", "TikTok", "Facebook", "YouTube", "LINE VOOM"] as const;
export const KOL_CONTENT = ["Reel", "Story", "Post", "TikTok"] as const;

export const CHANNELS = [
  "Facebook", "Instagram", "TikTok", "LINE OA", "Google", "In-store", "CRM / LINE OA",
] as const;

export const ADS_PLATFORMS = ["Facebook / Instagram", "TikTok", "Google", "LINE Ads", "Delivery (Grab/Line etc)", "Other"] as const;

export const PRIORITIES = ["High", "Med", "Low"] as const;

export const BRIEF_STATUSES = [
  "Draft", "Ready for Review", "Waiting for Approval",
  "Approved", "Need Revision", "In Progress", "Completed",
] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

// ── Row types ─────────────────────────────────────────────────────────────
/** A chosen platform + asset size pair (content can target several). */
export interface AssetTarget { platform: string; size: string; }

export interface BriefContentItem {
  id: string;
  title: string;
  subHead: string;
  requester: string;
  designer: string;
  approver: string;
  type: string;
  platforms: string[];      // multi-select
  assets: AssetTarget[];    // platform+size pairs (checkbox grid)
  publishDate: string;      // ISO
  graphicDueDate: string;   // ISO — creative delivery deadline, separate from publish
  requiredGraphic: boolean;
  requiredVideo: boolean;
  priority: string;
  status: string;
  // Content brief fields
  captionDirection: string;
  mainMessage: string;
  cta: string;
  productHighlight: string;
  mandatoryText: string;
  doDont: string;
  referenceBriefLink: string;
  referenceImageLink: string;
  driveLink: string;
  competitorLink: string;
  note: string;
}

export interface BriefKolItem {
  id: string;
  name: string;             // KOL / page name
  handle: string;           // @handle or page URL (real page, once proposed)
  platforms: string[];      // multi-select
  kolType: string;
  followers: number;
  count: number;
  expectedReach: number;
  // Engagement metric breakdown
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  views: number;
  budget: number;
  monthly?: MonthlyKolAllocation[];
  area: string;
  contentRequired: string[];
  postingStart: string;     // ISO
  postingEnd: string;       // ISO
  owner: string;            // KOL team
  status: string;
  note: string;
}

export interface AdsPlatformBudget { platform: string; amount: number; }
export interface MonthlyBudgetAllocation { month: string; amount: number; }
export interface MonthlyKolAllocation {
  month: string; budget: number; pages: number;
  /** Posting window inside that month (ISO dates) — rolls up into the item's
   *  overall postingStart/postingEnd automatically. */
  postStart?: string; postEnd?: string;
}

export interface BriefBudget {
  total: number;
  ads: number;
  kol: number;              // KOL envelope set in Budget Allocation → syncs to KOL Plan as its ceiling
  graphic: number;
  printing: number;
  crm: number;
  other: number;
  /** Free-text explanation for the Other bucket (shown when other > 0). */
  otherNote?: string;
  adsByPlatform: AdsPlatformBudget[];
  monthly?: MonthlyBudgetAllocation[];
}

export interface ApprovalLogEntry {
  action: string; by: string; at: string; comment?: string; from?: string; to?: string;
}

export interface CampaignBrief {
  id: string;
  /** Human-friendly running number, per brand — e.g. "TPN-2026-003". */
  code?: string;
  name: string;
  b: BrandId;
  branch: string;           // derived: branches joined (kept for module compatibility)
  branches: string[];       // multi-select branch ids
  objective: string;
  campaignType: string;
  priority: string;         // campaign-level
  startDate: string;        // ISO
  endDate: string;          // ISO
  launchDate: string;       // ISO — distinct from start/end
  audience: string;
  mainMessage: string;
  offer: string;
  channels: string[];
  concept: string;
  kvDirection: string;
  successMetrics: string[];
  successGoals: Record<string, string>;   // metric → goal value
  /** Link to the external campaign proposal deck/doc (Drive, Canva, …). */
  proposalLink?: string;
  plannerOwner: string;                    // auto = logged-in user
  approver: string;         // CMO only
  content: BriefContentItem[];
  kols: BriefKolItem[];
  budget: BriefBudget;
  status: BriefStatus;
  approvalLog: ApprovalLogEntry[];
  createdAt: string;
}

// ── Factories ─────────────────────────────────────────────────────────────
export function emptyContentItem(seq: number): BriefContentItem {
  return {
    id: `ci-${seq}`, title: "", subHead: "", requester: "", designer: "Unassigned", approver: "", type: CONTENT_TYPES[0], platforms: [],
    assets: [], publishDate: "", graphicDueDate: "", requiredGraphic: true,
    requiredVideo: false, priority: "Med", status: "Planned",
    captionDirection: "", mainMessage: "", cta: "", productHighlight: "",
    mandatoryText: "", doDont: "", referenceBriefLink: "", referenceImageLink: "",
    driveLink: "", competitorLink: "", note: "",
  };
}

export function emptyKolItem(seq: number): BriefKolItem {
  return {
    id: `kr-${seq}`, name: "", handle: "", platforms: [], kolType: KOL_TYPES[0], followers: 0,
    count: 1, expectedReach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, views: 0,
    budget: 0, monthly: [], area: "", contentRequired: ["Reel"], postingStart: "", postingEnd: "",
    owner: "", status: "Planned", note: "",
  };
}

export function emptyBudget(): BriefBudget {
  return { total: 0, ads: 0, kol: 0, graphic: 0, printing: 0, crm: 0, other: 0, adsByPlatform: [{ platform: ADS_PLATFORMS[0], amount: 0 }], monthly: [] };
}

export function campaignMonthKeys(startIso: string, endIso: string): string[] {
  const start = /^\d{4}-\d{2}/.exec(startIso)?.[0];
  const end = /^\d{4}-\d{2}/.exec(endIso)?.[0];
  if (!start || !end || end < start) return start ? [start] : [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const out: string[] = [];
  let year = sy, month = sm;
  while (year < ey || (year === ey && month <= em)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return out;
}

export const GRAPHIC_MIN_BUSINESS_DAYS = 5;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIsoLocal(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

export function addBusinessDays(startIso: string, days: number): string {
  const start = parseIsoLocal(startIso);
  if (!start) return "";
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) added += 1;
  }
  return toIsoLocal(d);
}

export function minGraphicDueDate(requestIso?: string): string {
  return addBusinessDays(requestIso || todayIso(), GRAPHIC_MIN_BUSINESS_DAYS);
}

export function isGraphicDueDateAllowed(dueIso: string, requestIso?: string): boolean {
  if (!dueIso) return false;
  const minDue = minGraphicDueDate(requestIso);
  return !!minDue && dueIso >= minDue;
}

export function emptyBrief(id: string): CampaignBrief {
  return {
    id, name: "", b: "teppen", branch: "", branches: [], objective: OBJECTIVES[0],
    campaignType: CAMPAIGN_TYPES[0], priority: "Med", startDate: "", endDate: "", launchDate: "",
    audience: "", mainMessage: "", offer: "", channels: [], concept: "", kvDirection: "",
    successMetrics: [], successGoals: {}, proposalLink: "", plannerOwner: "", approver: "", content: [], kols: [], budget: emptyBudget(),
    status: "Draft", approvalLog: [], createdAt: "",
  };
}

/** Next per-brand campaign code (e.g. TPN-2026-003). Counts existing briefs of
 *  the same brand + year and takes the highest running number + 1, so numbers
 *  stay unique and sequential within each brand without a central counter. */
export function nextCampaignCode(brand: BrandId, existing: CampaignBrief[], year = new Date().getFullYear()): string {
  const prefix = `${brandCode(brand)}-${year}-`;
  const maxN = existing.reduce((max, b) => {
    if (b.b !== brand || !b.code?.startsWith(prefix)) return max;
    const n = parseInt(b.code.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxN + 1).padStart(3, "0")}`;
}

// ── KOL engagement ────────────────────────────────────────────────────────
/** Engagement rate as a percentage number. Uses Reach; falls back to Follower
 *  when Reach is 0/absent. Returns 0 when neither is available. */
export function engagementRate(k: Pick<BriefKolItem, "likes" | "comments" | "shares" | "saves" | "clicks" | "expectedReach" | "followers">): number {
  const interactions = (k.likes || 0) + (k.comments || 0) + (k.shares || 0) + (k.saves || 0) + (k.clicks || 0);
  const base = k.expectedReach && k.expectedReach > 0 ? k.expectedReach : (k.followers || 0);
  if (!base) return 0;
  return (interactions / base) * 100;
}
/** Always render as a percentage string, never a raw decimal. */
export const fmtPct = (n: number): string => `${(n || 0).toFixed(2)}%`;

// ── KOL budget sync ───────────────────────────────────────────────────────
export const kolBudgetTotal = (brief: CampaignBrief): number => brief.kols.reduce((s, k) => s + (k.budget || 0), 0);

/** Per-month KOL budget summed across every KOL item's monthly split — the
 *  floor the campaign's Monthly Budget Plan must cover for that month.
 *  Items without a monthly split contribute to the total only, not per-month. */
export function kolMonthlyTotals(brief: CampaignBrief): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of brief.kols) {
    for (const row of k.monthly ?? []) {
      if (row.budget) out[row.month] = (out[row.month] || 0) + row.budget;
    }
  }
  return out;
}

/** Budget Allocation is the source of truth: the KOL envelope (budget.kol) is
 *  set here first and syncs INTO the KOL Plan as its ceiling. Saving must keep
 *  the typed envelope as-is (never bump it to the plan's item sum) — if the
 *  plan over-commits, that's flagged as a warning for the planner to resolve,
 *  not silently absorbed into the allocated total. */
export function withSyncedKolBudget(brief: CampaignBrief): CampaignBrief {
  return brief;
}

// ── Budget derivation ─────────────────────────────────────────────────────
export interface BudgetSummary {
  allocated: number; remaining: number; overAllocated: boolean;
  adsAllocated: number; adsMismatch: boolean;
  byBucket: { label: string; amount: number; pct: number }[];
  warnings: string[];
}

export function budgetSummary(brief: CampaignBrief): BudgetSummary {
  // KOL bucket = the envelope typed here in Budget Allocation — the source of
  // truth. The KOL Plan syncs FROM this ceiling, so allocation is NEVER
  // inflated to the plan's item sum. An over-commit (plan items > envelope) is
  // surfaced as a ⚠ warning on the KOL row, not by silently raising the total.
  const bud = { ...brief.budget };
  const buckets: [string, number][] = [
    ["Ads", bud.ads], ["KOL", bud.kol], ["Graphic / Production", bud.graphic],
    ["Printing / POSM", bud.printing], ["CRM / LINE OA", bud.crm], ["Other", bud.other],
  ];
  // Production (graphic) is an internal cost, NOT part of the campaign's media
  // allocation — it's excluded from the allocated total so it never counts
  // against the Total Campaign Budget or Finance "Committed".
  const PRODUCTION_LABEL = "Graphic / Production";
  const allocated = buckets.reduce((s, [label, v]) => s + (label === PRODUCTION_LABEL ? 0 : (v || 0)), 0);
  // Total auto-includes KOL: the effective total is at least the allocation.
  const effectiveTotal = Math.max(bud.total || 0, allocated);
  const remaining = effectiveTotal - allocated;
  const adsAllocated = bud.adsByPlatform.reduce((s, a) => s + (a.amount || 0), 0);

  const warnings: string[] = [];
  if (bud.total > 0 && allocated > bud.total) warnings.push(`งบที่จัดสรร (${allocated.toLocaleString()}) เกินงบรวม (${bud.total.toLocaleString()})`);
  // Mismatch only applies when platform lines exist — with lines, the Ads
  // total is auto-summed in the builder, so this mostly guards legacy briefs.
  const adsMismatch = bud.adsByPlatform.length > 0 && bud.ads > 0 && adsAllocated !== bud.ads;
  if (adsMismatch) warnings.push(`งบ Ads แยกตาม platform (${adsAllocated.toLocaleString()}) ไม่ตรงกับงบ Ads รวม (${bud.ads.toLocaleString()})`);
  if (brief.channels.some((c) => /crm|line oa/i.test(c)) && !bud.crm) warnings.push("เลือก channel CRM / LINE OA แต่ยังไม่ได้ใส่งบ CRM");
  if (brief.channels.some((c) => /facebook|instagram|tiktok|google/i.test(c)) && !bud.ads) warnings.push("เลือก channel โฆษณา แต่ยังไม่ได้ใส่งบ Ads");
  if ((bud.other || 0) > 0 && !(bud.otherNote || "").trim()) warnings.push("มีงบ Other แต่ยังไม่ได้ใส่คำอธิบายว่าเป็นค่าอะไร");
  const campaignMonths = campaignMonthKeys(brief.startDate, brief.endDate);
  const monthlyAllocated = (bud.monthly ?? []).filter((row) => campaignMonths.includes(row.month)).reduce((sum, row) => sum + (row.amount || 0), 0);
  if (campaignMonths.length > 1 && monthlyAllocated !== (bud.total || 0)) {
    warnings.push(`งบรายเดือน (${monthlyAllocated.toLocaleString()}) ต้องรวมเท่ากับงบ Campaign (${(bud.total || 0).toLocaleString()})`);
  }

  const byBucket = buckets.map(([label, amount]) => ({
    label, amount: amount || 0, pct: effectiveTotal ? Math.round(((amount || 0) / effectiveTotal) * 100) : 0,
  }));
  return { allocated, remaining, overAllocated: allocated > (bud.total || 0) && bud.total > 0, adsAllocated, adsMismatch, byBucket, warnings };
}

// ── Guideline checklist (bound to real fields) ────────────────────────────
/** must = blocks Submit (mirrors validateSubmit); !must = nice-to-have, warn only. */
export interface GuidelineItem { key: string; label: string; done: boolean; must: boolean }

export function guidelineChecklist(brief: CampaignBrief): GuidelineItem[] {
  const b = brief;
  return [
    { key: "objective", label: "Campaign objective ชัดเจนหรือยัง", done: !!b.objective, must: true },
    { key: "audience", label: "Target audience คือใคร", done: !!b.audience.trim(), must: true },
    { key: "message", label: "Main message คืออะไร", done: !!b.mainMessage.trim(), must: true },
    { key: "offer", label: "Offer / Promotion มีหรือไม่", done: !!b.offer.trim(), must: true },
    { key: "branch", label: "Branch ที่ใช้ campaign (อย่างน้อย 1 สาขา)", done: b.branches.length > 0, must: true },
    { key: "budget", label: "Budget รวมเท่าไร", done: b.budget.total > 0, must: true },
    { key: "content", label: "มี content item อย่างน้อย 1 ชิ้น + asset size ครบทุก platform", done: b.content.length > 0 && b.content.every((c) => c.platforms.length > 0 && c.platforms.every((p) => c.assets.some((a) => a.platform === p))), must: true },
    { key: "launch", label: "Launch date กำหนดแล้วหรือยัง", done: !!b.launchDate, must: true },
    { key: "approval", label: "Approver (CMO) กำหนดแล้วหรือยัง", done: !!b.approver.trim(), must: true },
    { key: "channel", label: "Channel ที่ต้องใช้มีอะไรบ้าง", done: b.channels.length > 0, must: false },
    { key: "kpi", label: "KPI ที่วัดผลคืออะไร", done: b.successMetrics.length > 0, must: false },
    { key: "graphic", label: "ต้องใช้ Graphic กี่ชิ้น", done: b.content.some((c) => c.requiredGraphic), must: false },
    { key: "kol", label: "ต้องใช้ KOL กี่คน / กี่เพจ", done: b.kols.length > 0, must: false },
    { key: "ads", label: "ต้องใช้ Ads platform ไหน", done: b.budget.adsByPlatform.some((a) => a.amount > 0), must: false },
    { key: "crm", label: "ต้องมี CRM / LINE OA ไหม", done: b.channels.some((c) => /crm|line oa/i.test(c)) || b.budget.crm > 0, must: false },
  ];
}

// ── Submit validation (Save Draft is exempt) ──────────────────────────────
/** Returns the list of blocking messages. Empty ⇒ OK to submit. */
export function validateSubmit(brief: CampaignBrief): string[] {
  const e: string[] = [];
  if (!brief.name.trim()) e.push("Please enter a Campaign Name");
  if (!brief.objective) e.push("Please select an Objective");
  if (!brief.campaignType) e.push("Please select a Campaign Type");
  if (!brief.b) e.push("Please select a Brand");
  if (brief.branches.length === 0) e.push("Please select at least one branch under this brand");
  if (!brief.startDate || !brief.endDate) e.push("Please select the Campaign Period (start and end date)");
  if (brief.startDate && brief.endDate && brief.endDate < brief.startDate) e.push("End Date must not be before Start Date");
  if (!brief.launchDate) e.push("Please select a Launch Date");
  // Planner (logged-in user) and Approver (the single CMO) are both auto-set.
  if (!brief.audience.trim()) e.push("Please enter the Target Audience");
  if (!brief.mainMessage.trim()) e.push("Please enter the Key Message");
  if (!brief.offer.trim()) e.push("Please enter the Main Offer");
  if (brief.budget.total <= 0) e.push("Please enter the total Budget");
  if (brief.content.length === 0) e.push("Please add at least one Content item (Platform)");
  brief.content.forEach((c, i) => {
    const tag = c.title.trim() || `Content #${i + 1}`;
    if (!c.title.trim()) e.push(`Please enter a Content Title for Content #${i + 1}`);
    if (!c.subHead.trim()) e.push(`Please enter a Sub Head for “${tag}”`);
    if (c.platforms.length === 0) e.push(`Please select at least one platform for “${tag}”`);
    c.platforms.forEach((p) => {
      if (!c.assets.some((a) => a.platform === p)) e.push(`Please select asset size for ${p}`);
    });
    if (c.requiredGraphic && !c.graphicDueDate) e.push(`Please select a Graphic Due Date for “${tag}”`);
    if (c.requiredGraphic && c.graphicDueDate && !isGraphicDueDateAllowed(c.graphicDueDate, todayIso())) e.push(`Graphic Due Date for “${tag}” must be at least ${GRAPHIC_MIN_BUSINESS_DAYS} business days after Request Date`);
    if (c.requiredGraphic && c.graphicDueDate && c.publishDate && c.graphicDueDate > c.publishDate) e.push(`Graphic Due Date for “${tag}” must not be after Publish Date`);
    // Reference Brief Link is optional — a real link often isn't known at planning time.
  });
  const months = campaignMonthKeys(brief.startDate, brief.endDate);
  if (months.length > 1) {
    const monthlyTotal = (brief.budget.monthly ?? []).filter((row) => months.includes(row.month)).reduce((sum, row) => sum + (row.amount || 0), 0);
    if (monthlyTotal !== brief.budget.total) e.push("Please allocate the Campaign Budget by month so the monthly total matches the Campaign Budget");
  }
  return e;
}

// ── Task / graphic preview ────────────────────────────────────────────────
export interface TaskPreview { kind: string; icon: string; count: number; detail: string }

// Mirrors saveCampaignBrief exactly: each content item becomes ONE work item.
// Items requiring creative become a Graphic task (with Platform × Size rows as
// deliverables); no-asset items become a Content task. This prevents duplicates.
export function taskPreview(brief: CampaignBrief): TaskPreview[] {
  const withGraphic = brief.content.filter((c) => c.requiredGraphic);
  const withoutGraphic = brief.content.filter((c) => !c.requiredGraphic);
  const creativePairs = withGraphic.flatMap((c) => c.assets);
  const adsPlatforms = brief.budget.adsByPlatform.filter((a) => a.amount > 0).length || (brief.budget.ads > 0 ? 1 : 0);
  const crm = brief.channels.some((c) => /crm|line oa/i.test(c)) || brief.budget.crm > 0 ? 1 : 0;
  const out: TaskPreview[] = [];
  if (withoutGraphic.length) out.push({ kind: "Content Tasks", icon: "📝", count: withoutGraphic.length, detail: `${withoutGraphic.length} item(s) without creative asset` });
  if (withGraphic.length) out.push({ kind: "Creative / Graphic Tasks", icon: "🎨", count: withGraphic.length, detail: `${withGraphic.length} request · ${creativePairs.length} asset(s)` });
  if (brief.kols.length) out.push({ kind: "KOL Tasks", icon: "🤝", count: brief.kols.length, detail: `${brief.kols.reduce((s, k) => s + (k.count || 0), 0)} creator/page` });
  if (adsPlatforms) out.push({ kind: "Ads Setup Tasks", icon: "📣", count: adsPlatforms, detail: `${adsPlatforms} platform` });
  if (crm) out.push({ kind: "CRM Task", icon: "💬", count: 1, detail: "LINE OA / CRM" });
  // Result report is handled/sent separately, so it's not previewed here.
  return out;
}

/** Total tasks that Submit will create — single source for the preview count. */
export function plannedTaskTotal(brief: CampaignBrief): number {
  return taskPreview(brief).reduce((s, t) => s + t.count, 0);
}
