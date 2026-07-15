// Content Calendar — ported from Content Calendar.dc.html. Content items carry the full
// publish-ready schema (caption, asset, approval, publish status) so a future Meta
// integration can be layered on without reshaping the data.

import { BrandId, BRAND_ORDER, brandName, brandColor } from "@/lib/brands";
import { Tone } from "@/lib/status";

export interface ContentItem {
  id: string;
  day: number;
  /** Full publish date (YYYY-MM-DD). Legacy rows only carry `day` — they were
   *  authored against the July 2026 wall calendar (see contentDateIso). */
  dateIso?: string;
  time: string;
  title: string;
  b: BrandId;
  plat: string;
  /** Optional multi-channel list; falls back to [plat] when absent. */
  platforms?: string[];
  status: string;
  campaign: string;
  owner: string;
  requester?: string;
  designer?: string;
  approver?: string;
  caption: string;
  hashtags: string;
  cta: string;
  footer?: string;
  captionStatus: string;
  assetStatus: string;
  approvalStatus: string;
  publishStatus: string;
  publishChannels?: string[];
  metaPostIds?: Record<string, string>;
  metaError?: string;
  scheduledBy?: string;
  scheduledAt?: string;
  scheduledFor?: string;
  /** Approval trail — set when a reviewer acts on the post. */
  approvedBy?: string;
  approvedAt?: string;
  feedbackRounds?: number;
  feedback?: { round: number; reason: string; by: string; at: string }[];
  /** Approved graphic deliverables attached from the Graphic Request module.
   *  Populated automatically once every deliverable of the linked graphic is approved. */
  assets?: { platform: string; size: string; link: string }[];
  /** External media link (Drive / Canva / final file) pasted on the schedule. */
  mediaLink?: string;
  /** Creative-ticked release state for the schedule: "" | "Released". */
  releaseStatus?: string;
  releasedBy?: string;
  releasedAt?: string;
  /** Manual-publish trail — set when someone clicks Publish in the Content Calendar. */
  publishedBy?: string;
  publishedAt?: string;
  /** Real relational links (no name matching). campaignId ties to the campaign
   *  row; sourceContentItemId is the brief content item — the pair is the
   *  idempotency key. graphicRequestId links the auto-created Graphic Request. */
  campaignId?: string;
  sourceContentItemId?: string;
  graphicRequestId?: string;
}

export const CONTENT: ContentItem[] = [
  { id: "c01", day: 5, time: "10:00", title: "Matcha dessert promo", b: "mainichi", plat: "Instagram", status: "Published", campaign: "LINE Coupon Drive", owner: "Mei T.", caption: "Indulge in our seasonal matcha…", hashtags: "#matcha #mainichi #lunch", cta: "Reserve now", captionStatus: "Approved", assetStatus: "Final", approvalStatus: "Approved", publishStatus: "Published" },
  { id: "c02", day: 12, time: "11:00", title: "Google Map photo refresh", b: "teppen", plat: "Google Map", status: "Published", campaign: "Wagyu Festival", owner: "Ken S.", caption: "", hashtags: "", cta: "", captionStatus: "Missing", assetStatus: "Final", approvalStatus: "Approved", publishStatus: "Published" },
  { id: "c03", day: 18, time: "12:00", title: "Wagyu plating reel", b: "teppen", plat: "Instagram Reel", status: "Published", campaign: "Wagyu Festival", owner: "Ken S.", caption: "A4 wagyu, seared to perfection.", hashtags: "#wagyu #teppen", cta: "Book via link in bio", captionStatus: "Approved", assetStatus: "Final", approvalStatus: "Approved", publishStatus: "Published" },
  { id: "c04", day: 21, time: "09:00", title: "Sake pairing post", b: "omakase", plat: "Facebook", status: "Published", campaign: "Father's Day Set", owner: "Ken S.", caption: "Perfect pairings for Dad.", hashtags: "#sake #omakase", cta: "", captionStatus: "Approved", assetStatus: "Final", approvalStatus: "Approved", publishStatus: "Published" },
  { id: "c05", day: 24, time: "18:00", title: "Summer reel BTS", b: "omakase", plat: "Instagram Reel", status: "Waiting Design", campaign: "Summer Reel Series", owner: "Boss", caption: "", hashtags: "", cta: "", captionStatus: "Missing", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft" },
  { id: "c06", day: 27, time: "10:00", title: "Wagyu drop teaser", b: "teppen", plat: "Instagram", status: "Scheduled", campaign: "Wagyu Festival", owner: "Ken S.", caption: "Something big is coming…", hashtags: "#wagyu #teppen #newdrop", cta: "Save the date", captionStatus: "Ready", assetStatus: "Approved", approvalStatus: "Approved", publishStatus: "Scheduled in OS" },
  { id: "c07", day: 27, time: "11:30", title: "Lunch set carousel", b: "mainichi", plat: "Facebook", status: "Scheduled", campaign: "Rainy Season Promo", owner: "Mei T.", caption: "Rainy season calls for warm sets.", hashtags: "#lunch #mainichi", cta: "Check menu", captionStatus: "Ready", assetStatus: "Approved", approvalStatus: "Approved", publishStatus: "Scheduled in OS" },
  { id: "c08", day: 27, time: "15:00", title: "Cocktail of the week", b: "touka", plat: "TikTok", status: "Scheduled", campaign: "Cocktail Hour Launch", owner: "Nok W.", caption: "This week: Yuzu Highball.", hashtags: "#cocktail #touka", cta: "Visit us", captionStatus: "Approved", assetStatus: "Final", approvalStatus: "Approved", publishStatus: "Scheduled in OS" },
  { id: "c09", day: 28, time: "17:00", title: "Behind the bar", b: "touka", plat: "TikTok", status: "Waiting Approval", campaign: "Cocktail Hour Launch", owner: "Nok W.", caption: "Draft caption only.", hashtags: "", cta: "", captionStatus: "Draft", assetStatus: "Waiting Feedback", approvalStatus: "Waiting Approval", publishStatus: "Draft" },
  { id: "c10", day: 29, time: "10:00", title: "Lunch set promo", b: "mainichi", plat: "LINE OA", status: "Draft", campaign: "Rainy Season Promo", owner: "Mei T.", caption: "", hashtags: "", cta: "", captionStatus: "Missing", assetStatus: "No Asset", approvalStatus: "Draft", publishStatus: "Draft" },
  { id: "c11", day: 30, time: "09:00", title: "Father's Day set", b: "omakase", plat: "Facebook", status: "Scheduled", campaign: "Father's Day Set", owner: "Ken S.", caption: "Celebrate Dad with Omakase.", hashtags: "#fathersday #omakase", cta: "Reserve", captionStatus: "Approved", assetStatus: "Final", approvalStatus: "Approved", publishStatus: "Queued" },
];

export const CONTENT_STATUS_TONE: Record<string, Tone> = {
  Draft: "neutral", "Waiting Design": "gold", "Waiting Approval": "orange",
  Scheduled: "blue", Published: "green", Failed: "red", "Missing Asset": "red",
  // caption/asset/approval sub-statuses
  Missing: "red", Ready: "blue", Approved: "green", Final: "green", "No Asset": "red",
  "Waiting Feedback": "gold", "Scheduled in OS": "blue", Queued: "blue", "Scheduled to Meta": "blue", Publishing: "blue",
  "Revision Requested": "orange",
};

export function contentTone(status: string): Tone {
  return CONTENT_STATUS_TONE[status] ?? "neutral";
}

/** Effective publish date. Legacy rows without dateIso were planned on the
 *  July 2026 calendar, so they resolve there instead of floating month-to-month. */
export function contentDateIso(c: ContentItem): string {
  return c.dateIso ?? `2026-07-${String(c.day || 1).padStart(2, "0")}`;
}

/** All channels for an item — the multi-select array, or [plat] as fallback. */
export function itemPlatforms(c: ContentItem): string[] {
  return c.platforms && c.platforms.length ? c.platforms : [c.plat];
}

export function platIcon(plat: string): { icon: string; bg: string; fg: string } {
  const m: Record<string, { icon: string; bg: string; fg: string }> = {
    Instagram: { icon: "IG", bg: "#E1306C", fg: "#fff" },
    "Instagram Reel": { icon: "Reel", bg: "#E1306C", fg: "#fff" },
    TikTok: { icon: "TK", bg: "#010101", fg: "#fff" },
    Facebook: { icon: "FB", bg: "#1877F2", fg: "#fff" },
    "LINE OA": { icon: "LN", bg: "#06C755", fg: "#fff" },
    "Google Map": { icon: "GM", bg: "#4285F4", fg: "#fff" },
  };
  return m[plat] ?? { icon: "?", bg: "#ccc", fg: "#fff" };
}

export interface BrandCard {
  b: BrandId; name: string; color: string;
  total: number; scheduled: number; waitApproval: number; missingAsset: number; failed: number;
}

export function brandOverview(source: ContentItem[] = CONTENT): BrandCard[] {
  return BRAND_ORDER.map((b) => {
    const items = source.filter((c) => c.b === b);
    return {
      b, name: brandName(b), color: brandColor(b),
      total: items.length,
      scheduled: items.filter((c) => c.status === "Scheduled").length,
      waitApproval: items.filter((c) => c.status === "Waiting Approval").length,
      // Asset still owed = any pending-design state (same assetStatus shown in the
      // detail modal). "No Asset" means no graphic is needed, so it doesn't count.
      missingAsset: items.filter((c) => ["Waiting Design", "Missing Asset", "Missing", "In Progress"].includes(c.assetStatus)).length,
      failed: items.filter((c) => c.status === "Failed").length,
    };
  });
}

export const PLATFORMS = ["Instagram", "Instagram Reel", "TikTok", "Facebook", "LINE OA", "Google Map"];

/** Overview-tab warnings for a content item. */
export function contentWarnings(c: ContentItem): string[] {
  const w: string[] = [];
  if (c.captionStatus === "Missing") w.push("Caption is missing");
  if (c.assetStatus === "No Asset") w.push("No asset attached");
  if (c.assetStatus === "Waiting Design") w.push("Asset waiting on design");
  if (c.approvalStatus === "Waiting Approval") w.push("Waiting for approval");
  return w;
}

/** Preflight checklist for the Publish tab. */
/** What still blocks this post from being APPROVED. Empty = ready for approval.
 *  Enforced in the UI (disabled button) AND the db layer (approveContent). */
export function contentApproveBlockers(c: ContentItem): string[] {
  const r: string[] = [];
  if (!(c.title || "").trim()) r.push("ใส่ชื่อโพสต์");
  if (itemPlatforms(c).length === 0) r.push("เลือกอย่างน้อย 1 platform");
  if (!(c.campaign || "").trim() || c.campaign === "—") r.push("ผูกกับ Campaign");
  if (!["Ready", "Approved"].includes(c.captionStatus)) r.push("Caption ยังไม่พร้อม (ต้อง Ready)");
  // "No Asset" = deliberately no graphic; otherwise the graphic must be approved.
  if (!["Approved", "Final", "No Asset"].includes(c.assetStatus)) r.push("Asset ยังไม่ถูกอนุมัติครบ");
  return r;
}

export const contentReadyForApproval = (c: ContentItem): boolean => contentApproveBlockers(c).length === 0;

/** When a Draft post becomes ready, move it into "Waiting Approval" so it shows
 *  up in My Approval automatically. Idempotent; never downgrades an approved post. */
export function advanceApprovalState(c: ContentItem): ContentItem {
  if (c.approvalStatus === "Approved") return c;
  const ready = contentReadyForApproval(c);
  if (ready && c.approvalStatus !== "Waiting Approval") {
    return { ...c, approvalStatus: "Waiting Approval", status: c.status === "Draft" ? "Waiting Approval" : c.status };
  }
  if (!ready && c.approvalStatus === "Waiting Approval") {
    // Became not-ready again (e.g. caption reverted) → pull back to Draft.
    return { ...c, approvalStatus: "Draft" };
  }
  return c;
}

export function preflight(c: ContentItem, metaConnected = false): { label: string; ok: boolean }[] {
  return [
    { label: "Caption ready", ok: ["Ready", "Approved"].includes(c.captionStatus) },
    { label: "Asset ready", ok: ["Approved", "Final"].includes(c.assetStatus) },
    { label: "Approval completed", ok: c.approvalStatus === "Approved" },
    // Meta auto-publish gates only matter once a Meta account is connected —
    // publishing is manual otherwise, so hiding them keeps the checklist from
    // looking perpetually incomplete.
    ...(metaConnected
      ? [
          { label: "Meta account mapped", ok: true },
          { label: "Server token configured", ok: true },
        ]
      : []),
  ];
}

/** Manual-publish gate. Auto-publish is deferred (no Meta), so publishing is a
 *  manual action — but only allowed once the creative is actually ready:
 *  caption ready + asset approved + content approved. Account/permission checks
 *  are skipped here because the post is published by hand outside the OS. */
export function canPublish(c: ContentItem): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!["Ready", "Approved"].includes(c.captionStatus)) reasons.push("Caption ยังไม่พร้อม (ต้อง Ready/Approved)");
  // "No Asset" = the post explicitly needs no graphic (text/repost) — it may
  // publish without waiting on the Graphic module.
  if (!["Approved", "Final", "No Asset"].includes(c.assetStatus)) reasons.push("Asset ยังไม่พร้อม — รอทีมกราฟฟิกส่ง & อนุมัติครบ");
  if (c.approvalStatus !== "Approved") reasons.push("Content ยังไม่ถูกอนุมัติ");
  if (["Published", "Scheduled in OS", "Queued", "Scheduled to Meta", "Publishing"].includes(c.publishStatus)) reasons.push("โพสต์นี้ publish/queue ไปแล้ว");
  return { ok: reasons.length === 0, reasons };
}

/** Attach approved graphic deliverables to a content post and mark its asset
 *  ready. Returns a fresh object (no mutation) so callers can persist + bubble up. */
export function attachApprovedAssets(
  c: ContentItem,
  assets: { platform: string; size: string; link: string }[],
): ContentItem {
  const clean = assets.filter((a) => a.link);
  return {
    ...c,
    assets: clean,
    assetStatus: clean.length ? "Approved" : c.assetStatus,
    status: c.status === "Waiting Design" ? "Draft" : c.status,
  };
}
