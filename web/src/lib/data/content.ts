// Content Calendar — ported from Content Calendar.dc.html. Content items carry the full
// publish-ready schema (caption, asset, approval, publish status) so a future Meta
// integration can be layered on without reshaping the data.

import { BrandId, BRAND_ORDER, brandName, brandColor } from "@/lib/brands";
import { Tone } from "@/lib/status";

export interface ContentItem {
  id: string;
  day: number;
  time: string;
  title: string;
  b: BrandId;
  plat: string;
  /** Optional multi-channel list; falls back to [plat] when absent. */
  platforms?: string[];
  status: string;
  campaign: string;
  owner: string;
  caption: string;
  hashtags: string;
  cta: string;
  captionStatus: string;
  assetStatus: string;
  approvalStatus: string;
  publishStatus: string;
  /** Approval trail — set when a reviewer acts on the post. */
  approvedBy?: string;
  approvedAt?: string;
  feedbackRounds?: number;
  feedback?: { round: number; reason: string; by: string; at: string }[];
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
  "Waiting Feedback": "gold", "Scheduled in OS": "blue", Queued: "blue",
  "Revision Requested": "orange",
};

export function contentTone(status: string): Tone {
  return CONTENT_STATUS_TONE[status] ?? "neutral";
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
      missingAsset: items.filter((c) => c.assetStatus === "No Asset" || c.assetStatus === "Missing Asset").length,
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
export function preflight(c: ContentItem): { label: string; ok: boolean }[] {
  return [
    { label: "Caption ready", ok: ["Ready", "Approved"].includes(c.captionStatus) },
    { label: "Asset ready", ok: ["Approved", "Final"].includes(c.assetStatus) },
    { label: "Account connected", ok: false },
    { label: "Permission valid", ok: false },
    { label: "Approval completed", ok: c.approvalStatus === "Approved" },
  ];
}
