// KOL / Creator — ported from KOL.dc.html. Full creator records with the deal pipeline,
// deliverables, comment threads, and specialist workload. Derivations produce the KPI
// strip, needs-attention list, and per-creator stage progress.

import { BrandId } from "@/lib/brands";

export interface KolStage { l: string; d: string; done: boolean; cur: boolean; }

export interface Kol {
  id: number;
  name: string;
  h: string; // handle
  plat: string;
  b: BrandId;
  branch: string;
  campaign: string;
  kolType: string;
  followers: number;
  expectedReach: number;
  actualReach: number;
  visits: number;
  fee: number;
  foodCost: number;
  totalCost: number;
  owner: string;
  ownerTeam: string;
  pendingApprover: string;
  currentBlocker: string | null;
  status: string;
  waitingSince: string | null;
  postDueDate: string;
  postedDate: string | null;
  openComments: number;
  latestComment: string;
  isOverdue: boolean;
  couponCode: string | null;
  contractStatus: string;
  quotationStatus: string;
  invoiceStatus: string;
  paymentStatus: string;
  financeReqId: string;
  paymentDue: string;
  roi: number;
  audienceFit: string;
  contentStyle: string;
  contactInfo: string;
  pastCollab: string;
  objective: string;
  target: string;
  keyMsg: string;
  offer: string;
  postingPeriod: string;
  engagement: string;
  saves: string;
  shares: string;
  postLink: string | null;
  /** Optional planning/result fields captured in the request + results stages. */
  expectedEngagement?: number;
  actualEngagement?: number;
  contactStatus?: string;
  postingDate?: string;
  /** Who requested this KOL (the campaign side). Approval tasks route back here. */
  requester?: string;
  /** Link to the campaign-independent master profile (kol_profiles.kol_id). */
  masterKolId?: string;
  stages: KolStage[];
}

// Consolidated 7-stage lifecycle (was 15). Fewer, clearer steps for the drawer
// dropdown; legacy records are folded in via normalizeStage().
export const ALL_STAGES = [
  "Prospect", "Negotiating", "Contract Signed", "Producing", "In Review", "Posted", "Completed",
];

// Map any legacy status onto the 7 consolidated stages. Unknown/new values and
// the special "Paused" pass through unchanged.
const STAGE_MAP: Record<string, string> = {
  Prospect: "Prospect", Shortlisted: "Prospect",
  Negotiating: "Negotiating", "Contract Pending": "Negotiating",
  "Contract Signed": "Contract Signed",
  "Brief Sent": "Producing", "Content Creating": "Producing",
  "Draft Submitted": "In Review", "Waiting Review": "In Review",
  "Revision Requested": "In Review", "Approved to Post": "In Review", Scheduled: "In Review",
  Posted: "Posted",
  Reporting: "Completed", Completed: "Completed",
};

export function normalizeStage(status: string): string {
  return STAGE_MAP[status] ?? status;
}

export const KOLS: Kol[] = [
  { id: 0, name: "Nong Aim", h: "@nongaim.eats", plat: "Instagram", b: "teppen", branch: "Thonglor", campaign: "Wagyu Festival", kolType: "Food Blogger", followers: 320000, expectedReach: 580000, actualReach: 420000, visits: 210, fee: 45000, foodCost: 5000, totalCost: 50000, owner: "Ken S.", ownerTeam: "KOL Team", pendingApprover: "Aran P.", currentBlocker: null, status: "Waiting Review", waitingSince: "Jun 25", postDueDate: "Jun 28", postedDate: null, openComments: 2, latestComment: "Caption too long", isOverdue: false, couponCode: "WAGYU2026", contractStatus: "Signed", quotationStatus: "Approved", invoiceStatus: "Pending", paymentStatus: "Unpaid", financeReqId: "REQ-001", paymentDue: "Jul 5", roi: 3.2, audienceFit: "High", contentStyle: "Food photography + short video", contactInfo: "Agency: CreatorHub · ken@creatorhub.co", pastCollab: "Wagyu teaser Jun 2025 — 3.8× ROI", objective: "Store Visit + Awareness", target: "BKK diners 28–45", keyMsg: "Taste the finest Wagyu in BKK", offer: "Wagyu Omakase set ฿2,990", postingPeriod: "Jun 25 – Jun 28", engagement: "18.2K", saves: "3.4K", shares: "1.2K", postLink: null,
    stages: [{ l: "Negotiate", d: "May 28", done: true, cur: false }, { l: "Contract", d: "Jun 1", done: true, cur: false }, { l: "Brief", d: "Jun 5", done: true, cur: false }, { l: "Create", d: "Jun 20", done: true, cur: false }, { l: "Review", d: "Jun 25", done: false, cur: true }, { l: "Post", d: "Jun 28", done: false, cur: false }] },
  { id: 1, name: "BkkFoodie", h: "@bkkfoodie", plat: "TikTok", b: "omakase", branch: "Siam Paragon", campaign: "Father's Day Set", kolType: "Food Vlogger", followers: 1200000, expectedReach: 1500000, actualReach: 1100000, visits: 540, fee: 80000, foodCost: 8000, totalCost: 88000, owner: "Ken S.", ownerTeam: "KOL Team", pendingApprover: "Aran P.", currentBlocker: null, status: "Draft Submitted", waitingSince: "Jun 28", postDueDate: "Jun 30", postedDate: null, openComments: 1, latestComment: "Video too long", isOverdue: false, couponCode: "FDAY2026", contractStatus: "Signed", quotationStatus: "Approved", invoiceStatus: "Issued", paymentStatus: "Pending", financeReqId: "REQ-002", paymentDue: "Jul 10", roi: 4.4, audienceFit: "Very High", contentStyle: "Vlog + food tour", contactInfo: "Direct · bkkfoodie@gmail.com", pastCollab: "Father's Day 2025 — 4.1× ROI", objective: "Awareness + Reservation", target: "Omakase enthusiasts", keyMsg: "Every meal tells a story", offer: "Father's Day Omakase ฿3,800/set", postingPeriod: "Jun 28 – Jun 30", engagement: "42K", saves: "8.1K", shares: "3.5K", postLink: null,
    stages: [{ l: "Negotiate", d: "Jun 1", done: true, cur: false }, { l: "Contract", d: "Jun 5", done: true, cur: false }, { l: "Brief", d: "Jun 8", done: true, cur: false }, { l: "Create", d: "Jun 20", done: true, cur: false }, { l: "Review", d: "Jun 28", done: false, cur: true }, { l: "Post", d: "Jun 30", done: false, cur: false }] },
  { id: 2, name: "Khun Pim", h: "@pimeats", plat: "Instagram", b: "mainichi", branch: "Asok", campaign: "LINE Coupon Drive", kolType: "Micro Influencer", followers: 95000, expectedReach: 120000, actualReach: 110000, visits: 64, fee: 18000, foodCost: 2000, totalCost: 20000, owner: "Nok W.", ownerTeam: "KOL Team", pendingApprover: "—", currentBlocker: null, status: "Completed", waitingSince: null, postDueDate: "May 30", postedDate: "May 30", openComments: 0, latestComment: "", isOverdue: false, couponCode: "LUNCH189", contractStatus: "Signed", quotationStatus: "Approved", invoiceStatus: "Paid", paymentStatus: "Paid", financeReqId: "REQ-003", paymentDue: "Jun 5", roi: 1.6, audienceFit: "Medium", contentStyle: "Daily food diary", contactInfo: "Direct · pim.eats@ig.com", pastCollab: "First collaboration", objective: "CRM + store visit", target: "Office workers near Asok", keyMsg: "Daily lunch elevated", offer: "Lunch set from ฿189", postingPeriod: "May 25 – May 30", engagement: "4.2K", saves: "820", shares: "310", postLink: "instagram.com/p/abc123",
    stages: [{ l: "Negotiate", d: "May 1", done: true, cur: false }, { l: "Contract", d: "May 5", done: true, cur: false }, { l: "Brief", d: "May 10", done: true, cur: false }, { l: "Create", d: "May 20", done: true, cur: false }, { l: "Review", d: "May 28", done: true, cur: false }, { l: "Post", d: "May 30", done: true, cur: false }] },
  { id: 3, name: "SauceMaster", h: "@saucemaster", plat: "TikTok", b: "touka", branch: "Silom", campaign: "Cocktail Hour Launch", kolType: "Food & Lifestyle", followers: 540000, expectedReach: 720000, actualReach: 0, visits: 0, fee: 35000, foodCost: 4000, totalCost: 39000, owner: "Ploy R.", ownerTeam: "KOL Team", pendingApprover: "Ken S.", currentBlocker: null, status: "Content Creating", waitingSince: "Jun 18", postDueDate: "Jul 5", postedDate: null, openComments: 0, latestComment: "", isOverdue: false, couponCode: "COCKTAIL5PM", contractStatus: "Signed", quotationStatus: "Approved", invoiceStatus: "Pending", paymentStatus: "Unpaid", financeReqId: "REQ-004", paymentDue: "Jul 15", roi: 2.1, audienceFit: "High", contentStyle: "Night life + cocktail culture", contactInfo: "Agency: TalentGo · ploy@talentgo.co", pastCollab: "First collaboration", objective: "Sales + awareness", target: "After-work crowd 25–38", keyMsg: "Where flavour meets ambiance", offer: "Cocktail hour 5–8PM · 1 free drink", postingPeriod: "Jul 1 – Jul 5", engagement: "—", saves: "—", shares: "—", postLink: null,
    stages: [{ l: "Negotiate", d: "Jun 10", done: true, cur: false }, { l: "Contract", d: "Jun 15", done: true, cur: false }, { l: "Brief", d: "Jun 18", done: true, cur: false }, { l: "Create", d: "Jul 1", done: false, cur: true }, { l: "Review", d: "Jul 3", done: false, cur: false }, { l: "Post", d: "Jul 5", done: false, cur: false }] },
  { id: 4, name: "Tokyo Tom", h: "@tokyotom", plat: "YouTube", b: "teppen", branch: "EmQuartier", campaign: "Wagyu Festival", kolType: "Chef / F&B Expert", followers: 210000, expectedReach: 0, actualReach: 0, visits: 0, fee: 60000, foodCost: 10000, totalCost: 70000, owner: "Ken S.", ownerTeam: "KOL Team", pendingApprover: "Ken S.", currentBlocker: "Fee negotiation", status: "Negotiating", waitingSince: "Jun 20", postDueDate: "TBD", postedDate: null, openComments: 0, latestComment: "", isOverdue: false, couponCode: null, contractStatus: "Pending", quotationStatus: "Pending", invoiceStatus: "Not issued", paymentStatus: "Not started", financeReqId: "—", paymentDue: "TBD", roi: 0, audienceFit: "Medium", contentStyle: "Long-form review + cooking", contactInfo: "Direct · tokyotom@yt.com", pastCollab: "No prior collab", objective: "Credibility + awareness", target: "Japanese cuisine enthusiasts", keyMsg: "Authentic Wagyu experience", offer: "Chef's table experience", postingPeriod: "TBD", engagement: "—", saves: "—", shares: "—", postLink: null,
    stages: [{ l: "Negotiate", d: "Jun 20", done: false, cur: true }, { l: "Contract", d: "TBD", done: false, cur: false }, { l: "Brief", d: "—", done: false, cur: false }, { l: "Create", d: "—", done: false, cur: false }, { l: "Review", d: "—", done: false, cur: false }, { l: "Post", d: "TBD", done: false, cur: false }] },
  { id: 5, name: "LINE Lady", h: "@linelady", plat: "Facebook", b: "mainichi", branch: "All branches", campaign: "Rainy Season Promo", kolType: "Lifestyle Blogger", followers: 78000, expectedReach: 95000, actualReach: 0, visits: 0, fee: 12000, foodCost: 1500, totalCost: 13500, owner: "Nok W.", ownerTeam: "KOL Team", pendingApprover: "—", currentBlocker: "Campaign on hold", status: "Paused", waitingSince: "May 15", postDueDate: "On hold", postedDate: null, openComments: 0, latestComment: "", isOverdue: false, couponCode: null, contractStatus: "Signed", quotationStatus: "Approved", invoiceStatus: "Not issued", paymentStatus: "Not started", financeReqId: "—", paymentDue: "TBD", roi: 0, audienceFit: "Low", contentStyle: "Daily lifestyle content", contactInfo: "Direct", pastCollab: "No prior collab", objective: "Awareness", target: "LINE users 30+", keyMsg: "Daily lunch elevated", offer: "Rainy season special", postingPeriod: "On hold", engagement: "—", saves: "—", shares: "—", postLink: null,
    stages: [{ l: "Negotiate", d: "May 15", done: true, cur: false }, { l: "Contract", d: "May 20", done: true, cur: false }, { l: "Brief", d: "—", done: false, cur: false }, { l: "Create", d: "—", done: false, cur: false }, { l: "Review", d: "—", done: false, cur: false }, { l: "Post", d: "On hold", done: false, cur: false }] },
];

export interface KolComment {
  id: number; kolId: number; type: string; text: string; owner: string;
  ownerTeam: string; ownerColor: string; assignedTo: string; status: string;
  relatedItem: string; createdAt: string; due: string | null;
}

export const KOL_COMMENTS: KolComment[] = [
  { id: 0, kolId: 0, type: "Revision request", text: "Caption is too long — needs to be under 150 characters. Current draft is 280 chars.", owner: "Ken S.", ownerTeam: "Content Team", ownerColor: "#3E5C9A", assignedTo: "Nong Aim", status: "Open", relatedItem: "Caption", createdAt: "Jun 26", due: "Jun 27" },
  { id: 1, kolId: 0, type: "General comment", text: "Please add #WagyuFestival2026 and tag @teppenbkk in the caption.", owner: "Ploy R.", ownerTeam: "Brand Team", ownerColor: "#B5577E", assignedTo: "Nong Aim", status: "Open", relatedItem: "Caption", createdAt: "Jun 26", due: "Jun 27" },
  { id: 2, kolId: 0, type: "Approval comment", text: "Brief approved. Visual direction is on point — proceed with content creation.", owner: "Aran P.", ownerTeam: "CMO", ownerColor: "#B8945A", assignedTo: "Ken S.", status: "Resolved", relatedItem: "Brief", createdAt: "Jun 10", due: null },
  { id: 3, kolId: 1, type: "Revision request", text: "Video is 2:45 min — maximum allowed is 90s for TikTok feed. Please re-edit.", owner: "Ken S.", ownerTeam: "KOL Team", ownerColor: "#3E5C9A", assignedTo: "BkkFoodie", status: "Open", relatedItem: "Draft video", createdAt: "Jun 28", due: "Jun 29" },
  { id: 4, kolId: 1, type: "Brief clarification", text: "Please confirm: the signature dish to feature is the Premium Omakase Don, not the regular set.", owner: "Ploy R.", ownerTeam: "Brand Team", ownerColor: "#B5577E", assignedTo: "BkkFoodie", status: "Resolved", relatedItem: "Brief", createdAt: "Jun 8", due: null },
];

export interface Deliverable {
  id: number; kolId: number; type: string; platform: string; qty: number;
  due: string; draftLink: string | null; finalPostLink: string | null;
  status: string; owner: string; pendingApprover: string | null; openComments: number;
}

export const DELIVERABLES: Deliverable[] = [
  { id: 0, kolId: 0, type: "Instagram Reel", platform: "Instagram", qty: 1, due: "Jun 28", draftLink: "#draft", finalPostLink: null, status: "Draft Submitted", owner: "Nong Aim", pendingApprover: "Ken S.", openComments: 2 },
  { id: 1, kolId: 0, type: "Instagram Story ×3", platform: "Instagram", qty: 3, due: "Jun 28", draftLink: null, finalPostLink: null, status: "Content Creating", owner: "Nong Aim", pendingApprover: null, openComments: 0 },
  { id: 2, kolId: 1, type: "TikTok Video", platform: "TikTok", qty: 1, due: "Jun 30", draftLink: "#draft2", finalPostLink: null, status: "Draft Submitted", owner: "BkkFoodie", pendingApprover: "Ken S.", openComments: 1 },
  { id: 3, kolId: 1, type: "TikTok Story ×2", platform: "TikTok", qty: 2, due: "Jun 30", draftLink: null, finalPostLink: null, status: "Content Creating", owner: "BkkFoodie", pendingApprover: null, openComments: 0 },
  { id: 4, kolId: 2, type: "Instagram Feed Post", platform: "Instagram", qty: 1, due: "May 30", draftLink: "#", finalPostLink: "#post3", status: "Completed", owner: "Khun Pim", pendingApprover: "—", openComments: 0 },
  { id: 5, kolId: 3, type: "TikTok Video", platform: "TikTok", qty: 1, due: "Jul 5", draftLink: null, finalPostLink: null, status: "Content Creating", owner: "SauceMaster", pendingApprover: "Ploy R.", openComments: 0 },
];

export interface Specialist { name: string; init: string; color: string; kols: number; active: number; done: number; waiting: number; comments: number; pct: number; }

// Cleared for go-live — the specialist dashboard is empty until wired to live data.
export const SPECIALISTS: Specialist[] = [];

export function initials(name: string): string {
  return (name.slice(0, 1) + (name.split(" ")[1] || "").slice(0, 1)).toUpperCase();
}

export function fmtFollow(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** KPI strip + needs-attention list for a filtered KOL set. */
export function kolKpis(list: Kol[]) {
  const active = list.filter((k) => !["Completed", "Cancelled", "Paused"].includes(k.status)).length;
  const waitingReview = list.filter((k) => k.status === "Waiting Review" || k.status === "Draft Submitted").length;
  const openComments = list.reduce((s, k) => s + k.openComments, 0);
  const fees = list.reduce((s, k) => s + k.fee, 0);
  const expReach = list.reduce((s, k) => s + k.expectedReach, 0);
  const roiK = list.filter((k) => k.roi > 0);
  const avgRoas = roiK.length ? roiK.reduce((s, k) => s + k.roi, 0) / roiK.length : 0;
  return { active, waitingReview, openComments, fees, expReach, avgRoas };
}

export function kolAlerts(list: Kol[]): Kol[] {
  return list.filter((k) => k.openComments > 0 || k.isOverdue || k.status === "Waiting Review" || k.status === "Revision Requested");
}

export function stageProgress(status: string): { idx: number; total: number } {
  const idx = ALL_STAGES.indexOf(normalizeStage(status));
  return { idx: idx >= 0 ? idx : 0, total: ALL_STAGES.length };
}
