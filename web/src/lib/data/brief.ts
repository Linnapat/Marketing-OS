// Flexible Campaign Brief model — NOT a fixed template. The Planner composes a
// brief freely; a guideline checklist tracks real fields; content/KOL/budget
// drive auto-generated graphics and tasks. Submit enforces a required-field set;
// Save Draft does not.

import { BrandId } from "@/lib/brands";

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
  "Visit", "Reach", "Engagement", "New Member", "Repeater",
  "ROAS", "Coupon Used", "Booking", "Sales",
] as const;

export const CONTENT_TYPES = [
  "Photo", "Reel", "Short Video", "Carousel", "Story",
  "LINE Rich Message", "Poster", "Menu Insert", "POSM",
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

export const ADS_PLATFORMS = ["Facebook / Instagram", "TikTok", "Google", "LINE Ads", "Other"] as const;

export const PRIORITIES = ["High", "Med", "Low"] as const;

export const BRIEF_STATUSES = [
  "Draft", "Ready for Review", "Waiting for Approval",
  "Approved", "Need Revision", "In Progress", "Completed",
] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

// ── Row types ─────────────────────────────────────────────────────────────
export interface BriefContentItem {
  id: string;
  title: string;
  subHead: string;
  type: string;
  platform: string;
  assetSize: string;
  publishDate: string;      // ISO
  captionOwner: string;     // Creative team
  creativeOwner: string;    // Creative team
  requiredGraphic: boolean;
  requiredVideo: boolean;
  priority: string;
  status: string;
  // Content brief fields
  captionDirection: string;
  mainMessage: string;
  cta: string;
  productHighlight: string;
  moodTone: string;
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
  platform: string;
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
  area: string;
  contentRequired: string[];
  postingStart: string;     // ISO
  postingEnd: string;       // ISO
  owner: string;            // KOL team
  status: string;
  note: string;
}

export interface AdsPlatformBudget { platform: string; amount: number; }

export interface BriefBudget {
  total: number;
  ads: number;
  kol: number;              // derived (read-only) = SUM(kol.budget)
  graphic: number;
  printing: number;
  crm: number;
  other: number;
  adsByPlatform: AdsPlatformBudget[];
}

export interface ApprovalLogEntry {
  action: string; by: string; at: string; comment?: string; from?: string; to?: string;
}

export interface CampaignBrief {
  id: string;
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
  plannerOwner: string;
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
    id: `ci-${seq}`, title: "", subHead: "", type: CONTENT_TYPES[0], platform: CONTENT_PLATFORMS[0],
    assetSize: "", publishDate: "", captionOwner: "", creativeOwner: "", requiredGraphic: true,
    requiredVideo: false, priority: "Med", status: "Planned",
    captionDirection: "", mainMessage: "", cta: "", productHighlight: "", moodTone: "",
    mandatoryText: "", doDont: "", referenceBriefLink: "", referenceImageLink: "",
    driveLink: "", competitorLink: "", note: "",
  };
}

export function emptyKolItem(seq: number): BriefKolItem {
  return {
    id: `kr-${seq}`, name: "", platform: KOL_PLATFORMS[0], kolType: KOL_TYPES[0], followers: 0,
    count: 1, expectedReach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, views: 0,
    budget: 0, area: "", contentRequired: ["Reel"], postingStart: "", postingEnd: "",
    owner: "", status: "Planned", note: "",
  };
}

export function emptyBudget(): BriefBudget {
  return { total: 0, ads: 0, kol: 0, graphic: 0, printing: 0, crm: 0, other: 0, adsByPlatform: [{ platform: ADS_PLATFORMS[0], amount: 0 }] };
}

export function emptyBrief(id: string): CampaignBrief {
  return {
    id, name: "", b: "teppen", branch: "", branches: [], objective: OBJECTIVES[0],
    campaignType: CAMPAIGN_TYPES[0], priority: "Med", startDate: "", endDate: "", launchDate: "",
    audience: "", mainMessage: "", offer: "", channels: [], concept: "", kvDirection: "",
    successMetrics: [], plannerOwner: "", approver: "", content: [], kols: [], budget: emptyBudget(),
    status: "Draft", approvalLog: [], createdAt: "",
  };
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

/** Return a brief whose KOL budget bucket is synced to the KOL plan sum. */
export function withSyncedKolBudget(brief: CampaignBrief): CampaignBrief {
  const kol = kolBudgetTotal(brief);
  if (brief.budget.kol === kol) return brief;
  return { ...brief, budget: { ...brief.budget, kol } };
}

// ── Budget derivation ─────────────────────────────────────────────────────
export interface BudgetSummary {
  allocated: number; remaining: number; overAllocated: boolean;
  adsAllocated: number; adsMismatch: boolean;
  byBucket: { label: string; amount: number; pct: number }[];
  warnings: string[];
}

export function budgetSummary(brief: CampaignBrief): BudgetSummary {
  const kol = kolBudgetTotal(brief);                    // KOL bucket is always the plan sum
  const bud = { ...brief.budget, kol };
  const buckets: [string, number][] = [
    ["Ads", bud.ads], ["KOL", bud.kol], ["Graphic / Production", bud.graphic],
    ["Printing / POSM", bud.printing], ["CRM / LINE OA", bud.crm], ["Other", bud.other],
  ];
  const allocated = buckets.reduce((s, [, v]) => s + (v || 0), 0);
  // Total auto-includes KOL: the effective total is at least the allocation.
  const effectiveTotal = Math.max(bud.total || 0, allocated);
  const remaining = effectiveTotal - allocated;
  const adsAllocated = bud.adsByPlatform.reduce((s, a) => s + (a.amount || 0), 0);

  const warnings: string[] = [];
  if (bud.total > 0 && allocated > bud.total) warnings.push(`งบที่จัดสรร (${allocated.toLocaleString()}) เกินงบรวม (${bud.total.toLocaleString()})`);
  const adsMismatch = bud.ads > 0 && adsAllocated !== bud.ads;
  if (adsMismatch) warnings.push(`งบ Ads แยกตาม platform (${adsAllocated.toLocaleString()}) ไม่ตรงกับงบ Ads รวม (${bud.ads.toLocaleString()})`);
  if (brief.channels.some((c) => /crm|line oa/i.test(c)) && !bud.crm) warnings.push("เลือก channel CRM / LINE OA แต่ยังไม่ได้ใส่งบ CRM");
  if (brief.channels.some((c) => /facebook|instagram|tiktok|google/i.test(c)) && !bud.ads) warnings.push("เลือก channel โฆษณา แต่ยังไม่ได้ใส่งบ Ads");

  const byBucket = buckets.map(([label, amount]) => ({
    label, amount: amount || 0, pct: effectiveTotal ? Math.round(((amount || 0) / effectiveTotal) * 100) : 0,
  }));
  return { allocated, remaining, overAllocated: allocated > (bud.total || 0) && bud.total > 0, adsAllocated, adsMismatch, byBucket, warnings };
}

// ── Guideline checklist (bound to real fields) ────────────────────────────
export interface GuidelineItem { key: string; label: string; done: boolean }

export function guidelineChecklist(brief: CampaignBrief): GuidelineItem[] {
  const b = brief;
  return [
    { key: "objective", label: "Campaign objective ชัดเจนหรือยัง", done: !!b.objective },
    { key: "audience", label: "Target audience คือใคร", done: !!b.audience.trim() },
    { key: "message", label: "Main message คืออะไร", done: !!b.mainMessage.trim() },
    { key: "offer", label: "Offer / Promotion มีหรือไม่", done: !!b.offer.trim() },
    { key: "branch", label: "Branch ที่ใช้ campaign (อย่างน้อย 1 สาขา)", done: b.branches.length > 0 },
    { key: "channel", label: "Channel ที่ต้องใช้มีอะไรบ้าง", done: b.channels.length > 0 },
    { key: "budget", label: "Budget รวมเท่าไร", done: b.budget.total > 0 },
    { key: "kpi", label: "KPI ที่วัดผลคืออะไร", done: b.successMetrics.length > 0 },
    { key: "content", label: "มี content item อย่างน้อย 1 ชิ้น + asset size ครบ", done: b.content.length > 0 && b.content.every((c) => !!c.assetSize) },
    { key: "graphic", label: "ต้องใช้ Graphic กี่ชิ้น", done: b.content.some((c) => c.requiredGraphic) },
    { key: "kol", label: "ต้องใช้ KOL กี่คน / กี่เพจ", done: b.kols.length > 0 },
    { key: "ads", label: "ต้องใช้ Ads platform ไหน", done: b.budget.adsByPlatform.some((a) => a.amount > 0) },
    { key: "crm", label: "ต้องมี CRM / LINE OA ไหม", done: b.channels.some((c) => /crm|line oa/i.test(c)) || b.budget.crm > 0 },
    { key: "launch", label: "Launch date กำหนดแล้วหรือยัง", done: !!b.launchDate },
    { key: "approval", label: "Approver (CMO) กำหนดแล้วหรือยัง", done: !!b.approver.trim() },
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
  if (!brief.plannerOwner) e.push("Please select an Owner (Planner)");
  if (!brief.approver) e.push("Please select an Approver (CMO)");
  if (!brief.audience.trim()) e.push("Please enter the Target Audience");
  if (!brief.mainMessage.trim()) e.push("Please enter the Key Message");
  if (!brief.offer.trim()) e.push("Please enter the Main Offer");
  if (brief.budget.total <= 0) e.push("Please enter the total Budget");
  if (brief.content.length === 0) e.push("Please add at least one Content item (Platform)");
  brief.content.forEach((c, i) => {
    const tag = c.title.trim() || `Content #${i + 1}`;
    if (!c.title.trim()) e.push(`Please enter a Content Title for Content #${i + 1}`);
    if (!c.subHead.trim()) e.push(`Please enter a Sub Head for “${tag}”`);
    if (!c.assetSize) e.push(`Please select asset size for ${c.platform}`);
    if (!c.referenceBriefLink.trim()) e.push(`Please add a Reference Brief Link for “${tag}”`);
  });
  return e;
}

// ── Task / graphic preview ────────────────────────────────────────────────
export interface TaskPreview { kind: string; icon: string; count: number; detail: string }

export function taskPreview(brief: CampaignBrief): TaskPreview[] {
  // Creative tasks are per Platform + Asset Size pair, not just per content item.
  const creativePairs = brief.content.filter((c) => c.requiredGraphic && c.assetSize);
  const videos = brief.content.filter((c) => c.requiredVideo).length;
  const adsPlatforms = brief.budget.adsByPlatform.filter((a) => a.amount > 0).length || (brief.budget.ads > 0 ? 1 : 0);
  const crm = brief.channels.some((c) => /crm|line oa/i.test(c)) || brief.budget.crm > 0 ? 1 : 0;
  const out: TaskPreview[] = [];
  if (brief.content.length) out.push({ kind: "Content Tasks", icon: "📝", count: brief.content.length, detail: `${brief.content.length} content item(s)` });
  if (creativePairs.length) out.push({ kind: "Creative / Graphic Tasks", icon: "🎨", count: creativePairs.length, detail: creativePairs.map((c) => `${c.platform} ${c.assetSize.split(" ")[0]}`).slice(0, 4).join(", ") + (creativePairs.length > 4 ? "…" : "") });
  if (videos) out.push({ kind: "Video Tasks", icon: "🎬", count: videos, detail: `จาก content ที่ต้องใช้ video` });
  if (brief.kols.length) out.push({ kind: "KOL Tasks", icon: "🤝", count: brief.kols.length, detail: `${brief.kols.reduce((s, k) => s + (k.count || 0), 0)} creator/page` });
  if (adsPlatforms) out.push({ kind: "Ads Setup Tasks", icon: "📣", count: adsPlatforms, detail: `${adsPlatforms} platform` });
  if (crm) out.push({ kind: "CRM Task", icon: "💬", count: 1, detail: "LINE OA / CRM" });
  out.push({ kind: "Result Report", icon: "📊", count: 1, detail: "Campaign result tracking" });
  return out;
}
