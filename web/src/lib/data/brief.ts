// Flexible Campaign Brief model — NOT a fixed template. The Planner composes a
// brief freely; a guideline checklist helps them not miss anything, and the
// content/KOL/budget they enter drives auto-generated graphics and tasks.

import { BrandId } from "@/lib/brands";

// ── Option sets (guidance, never enforced) ────────────────────────────────
export const OBJECTIVES = [
  "Awareness", "New Customer", "Repeater", "CRM", "Delivery",
  "Store Visit", "Launch", "Seasonal", "Brand Campaign",
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

export const KOL_TYPES = [
  "Foodie", "Lifestyle", "Office Worker", "Japanese Food", "Family", "Micro", "Nano", "Macro",
] as const;

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
  type: string;         // CONTENT_TYPES
  platform: string;     // CONTENT_PLATFORMS
  publishDate: string;  // ISO
  captionOwner: string;
  creativeOwner: string;
  requiredGraphic: boolean;
  requiredVideo: boolean;
  priority: string;
  status: string;
  note: string;
}

export interface BriefKolItem {
  id: string;
  kolType: string;
  count: number;        // creators / pages
  expectedReach: number;
  expectedEngagement: number;
  budget: number;
  area: string;         // branch / area
  contentRequired: string[];
  postingStart: string; // ISO
  postingEnd: string;   // ISO
  owner: string;
  status: string;
  note: string;
}

export interface AdsPlatformBudget { platform: string; amount: number; }

export interface BriefBudget {
  total: number;
  ads: number;
  kol: number;
  graphic: number;
  printing: number;
  crm: number;
  other: number;
  adsByPlatform: AdsPlatformBudget[];
}

export interface ApprovalLogEntry {
  action: string;       // Submitted | Approved | Sent back | Status change
  by: string;
  at: string;           // ISO datetime
  comment?: string;
  from?: string;
  to?: string;
}

export interface CampaignBrief {
  id: string;           // CAM-2026-XXXX
  name: string;
  b: BrandId;
  branch: string;
  objective: string;
  startDate: string;    // ISO
  endDate: string;      // ISO
  audience: string;
  mainMessage: string;
  offer: string;
  channels: string[];
  concept: string;
  kvDirection: string;
  successMetrics: string[];
  plannerOwner: string;
  approver: string;
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
    id: `ci-${seq}`, title: "", type: CONTENT_TYPES[0], platform: CONTENT_PLATFORMS[0],
    publishDate: "", captionOwner: "", creativeOwner: "", requiredGraphic: true,
    requiredVideo: false, priority: "Med", status: "Planned", note: "",
  };
}

export function emptyKolItem(seq: number): BriefKolItem {
  return {
    id: `kr-${seq}`, kolType: KOL_TYPES[0], count: 1, expectedReach: 0, expectedEngagement: 0,
    budget: 0, area: "", contentRequired: ["Reel"], postingStart: "", postingEnd: "",
    owner: "", status: "Planned", note: "",
  };
}

export function emptyBudget(): BriefBudget {
  return {
    total: 0, ads: 0, kol: 0, graphic: 0, printing: 0, crm: 0, other: 0,
    adsByPlatform: [{ platform: ADS_PLATFORMS[0], amount: 0 }],
  };
}

export function emptyBrief(id: string): CampaignBrief {
  return {
    id, name: "", b: "teppen", branch: "", objective: OBJECTIVES[0],
    startDate: "", endDate: "", audience: "", mainMessage: "", offer: "",
    channels: [], concept: "", kvDirection: "", successMetrics: [],
    plannerOwner: "", approver: "", content: [], kols: [], budget: emptyBudget(),
    status: "Draft", approvalLog: [], createdAt: "",
  };
}

// ── Budget derivation ─────────────────────────────────────────────────────
export interface BudgetSummary {
  allocated: number;
  remaining: number;
  overAllocated: boolean;
  adsAllocated: number;
  adsMismatch: boolean;           // ads-by-platform ≠ ads bucket
  byBucket: { label: string; amount: number; pct: number }[];
  warnings: string[];
}

export function budgetSummary(brief: CampaignBrief): BudgetSummary {
  const bud = brief.budget;
  const buckets: [string, number][] = [
    ["Ads", bud.ads], ["KOL", bud.kol], ["Graphic / Production", bud.graphic],
    ["Printing / POSM", bud.printing], ["CRM / LINE OA", bud.crm], ["Other", bud.other],
  ];
  const allocated = buckets.reduce((s, [, v]) => s + (v || 0), 0);
  const remaining = (bud.total || 0) - allocated;
  const adsAllocated = bud.adsByPlatform.reduce((s, a) => s + (a.amount || 0), 0);

  const warnings: string[] = [];
  if (bud.total > 0 && allocated > bud.total) warnings.push(`งบที่จัดสรร (${allocated.toLocaleString()}) เกินงบรวม (${bud.total.toLocaleString()})`);
  const adsMismatch = bud.ads > 0 && adsAllocated !== bud.ads;
  if (adsMismatch) warnings.push(`งบ Ads แยกตาม platform (${adsAllocated.toLocaleString()}) ไม่ตรงกับงบ Ads รวม (${bud.ads.toLocaleString()})`);
  // Channel chosen but no budget put against it.
  if (brief.channels.some((c) => /crm|line oa/i.test(c)) && !bud.crm) warnings.push("เลือก channel CRM / LINE OA แต่ยังไม่ได้ใส่งบ CRM");
  if (brief.channels.some((c) => /facebook|instagram|tiktok|google/i.test(c)) && !bud.ads) warnings.push("เลือก channel โฆษณา แต่ยังไม่ได้ใส่งบ Ads");

  const byBucket = buckets.map(([label, amount]) => ({
    label, amount: amount || 0, pct: bud.total ? Math.round(((amount || 0) / bud.total) * 100) : 0,
  }));

  return { allocated, remaining, overAllocated: allocated > (bud.total || 0) && bud.total > 0, adsAllocated, adsMismatch, byBucket, warnings };
}

// ── Guideline checklist (help, not a gate) ────────────────────────────────
export interface GuidelineItem { key: string; label: string; done: boolean }

export function guidelineChecklist(brief: CampaignBrief): GuidelineItem[] {
  const b = brief;
  return [
    { key: "objective", label: "Campaign objective ชัดเจนหรือยัง", done: !!b.objective },
    { key: "audience", label: "Target audience คือใคร", done: !!b.audience.trim() },
    { key: "message", label: "Main message คืออะไร", done: !!b.mainMessage.trim() },
    { key: "offer", label: "Offer / Promotion มีหรือไม่", done: !!b.offer.trim() },
    { key: "branch", label: "Branch ที่ใช้ campaign คือสาขาไหน", done: !!b.branch.trim() },
    { key: "channel", label: "Channel ที่ต้องใช้มีอะไรบ้าง", done: b.channels.length > 0 },
    { key: "budget", label: "Budget รวมเท่าไร", done: b.budget.total > 0 },
    { key: "kpi", label: "KPI ที่วัดผลคืออะไร", done: b.successMetrics.length > 0 },
    { key: "graphic", label: "ต้องใช้ Graphic กี่ชิ้น", done: b.content.some((c) => c.requiredGraphic) },
    { key: "kol", label: "ต้องใช้ KOL กี่คน / กี่เพจ", done: b.kols.length > 0 },
    { key: "ads", label: "ต้องใช้ Ads platform ไหน", done: b.budget.adsByPlatform.some((a) => a.amount > 0) },
    { key: "crm", label: "ต้องมี CRM / LINE OA ไหม", done: b.channels.some((c) => /crm|line oa/i.test(c)) || b.budget.crm > 0 },
    { key: "approval", label: "ต้องมี approval จากใครบ้าง", done: !!b.approver.trim() },
  ];
}

// ── Task / graphic preview (what Submit will generate) ────────────────────
export interface TaskPreview { kind: string; icon: string; count: number; detail: string }

export function taskPreview(brief: CampaignBrief): TaskPreview[] {
  const graphics = brief.content.filter((c) => c.requiredGraphic).length;
  const videos = brief.content.filter((c) => c.requiredVideo).length;
  const adsPlatforms = brief.budget.adsByPlatform.filter((a) => a.amount > 0).length
    || (brief.budget.ads > 0 ? 1 : 0);
  const crm = brief.channels.some((c) => /crm|line oa/i.test(c)) || brief.budget.crm > 0 ? 1 : 0;
  const out: TaskPreview[] = [];
  if (brief.content.length) out.push({ kind: "Content Tasks", icon: "📝", count: brief.content.length, detail: `${brief.content.length} content item(s)` });
  if (graphics) out.push({ kind: "Graphic Requests", icon: "🎨", count: graphics, detail: `จาก content ที่ต้องใช้ graphic` });
  if (videos) out.push({ kind: "Video Tasks", icon: "🎬", count: videos, detail: `จาก content ที่ต้องใช้ video` });
  if (brief.kols.length) out.push({ kind: "KOL Tasks", icon: "🤝", count: brief.kols.length, detail: `${brief.kols.reduce((s, k) => s + (k.count || 0), 0)} creator/page` });
  if (adsPlatforms) out.push({ kind: "Ads Setup Tasks", icon: "📣", count: adsPlatforms, detail: `${adsPlatforms} platform` });
  if (crm) out.push({ kind: "CRM Task", icon: "💬", count: 1, detail: "LINE OA / CRM" });
  out.push({ kind: "Result Report", icon: "📊", count: 1, detail: "Campaign result tracking" });
  return out;
}
