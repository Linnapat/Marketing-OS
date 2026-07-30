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
  /** Brief guide carried from the Content Plan item — reference for the
   *  caption writer (main head = title, plus these). All optional. */
  subHead?: string;
  mainMessage?: string;
  productHighlight?: string;
  captionDirection?: string;
  /** Google Drive folder from the campaign brief — the creative team's working
   *  files for this post. Shown as a column in Content Plan so nobody has to
   *  open the campaign to find it. */
  driveLink?: string;
  mandatoryText?: string;
  doDont?: string;
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
  /** In-app trail of planner-side changes — who moved this post between
   *  campaigns, who rescheduled it. Creative asked to be told when a post they
   *  are producing for changes; this is the record that backs the banner on the
   *  graphic request. */
  changeLog?: ContentChange[];
}

export interface ContentChange {
  at: string;
  by: string;
  /** Short verb for the row: "ย้ายแคมเปญ", "แก้กำหนดลง", … */
  action: string;
  detail?: string;
}

/** Append a change, newest last, capped so the data blob stays bounded. */
export function withChange(c: ContentItem, by: string, action: string, detail?: string): ContentItem {
  const changeLog = [...(c.changeLog ?? []), { at: new Date().toISOString(), by, action, detail }];
  return { ...c, changeLog: changeLog.slice(-30) };
}

/** Move a post to another campaign, recording it.
 *
 *  campaignId moves with the name: matching campaigns by name alone breaks on a
 *  rename, and a post whose id still points at the old campaign shows up under
 *  both. Passing an empty id detaches the post from any campaign. */
export function moveToCampaign(
  c: ContentItem, to: { id?: string; name: string }, by: string,
): ContentItem {
  const from = c.campaign?.trim() || "—";
  const moved: ContentItem = {
    ...c,
    campaign: to.name,
    campaignId: to.id || undefined,
    // sourceContentItemId names a row in the SOURCE campaign's brief ("ci-2"),
    // and those numbers restart per campaign — every campaign has its own ci-2.
    // Carried into the destination it means nothing, and it actively breaks
    // things: it collides with that campaign's real ci-2 under the
    // (campaign_id, sourceContentItemId) unique index, and a later re-Submit
    // there would treat the destination's own plan item as already
    // materialised. The post is no longer any plan row's output once it moves,
    // so the link is dropped; where it came from lives in the change log.
    sourceContentItemId: undefined,
  };
  return withChange(moved, by, "ย้ายแคมเปญ",
    `${from} → ${to.name || "—"}${c.sourceContentItemId ? ` (เดิมมาจากแผน ${c.sourceContentItemId})` : ""}`);
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

/** Schedule order: by publish date, then time of day, then title.
 *
 *  One comparator for every surface that lists posts, so the Content Plan reads
 *  in calendar order wherever you look. Two posts on the same date used to fall
 *  back to insertion order, which put the 18:00 post above the 09:00 one; the
 *  title tie-break keeps the order stable across reloads. */
export function bySchedule(a: ContentItem, b: ContentItem): number {
  return contentDateIso(a).localeCompare(contentDateIso(b))
    || (a.time || "").localeCompare(b.time || "")
    || (a.title || "").localeCompare(b.title || "");
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

/** Other posts of the SAME BRAND already planned on this post's publish date.
 *
 *  Scoped to the brand on purpose: Teppen and Mainichi posting the same day is
 *  normal — they are different audiences — while two Teppen posts on one day is
 *  the thing the team wants to catch before it ships. Deleted posts never reach
 *  here (fetchContent filters them), so a clash with something already in the
 *  bin is not reported. */
export function sameDayPosts(c: ContentItem, all: ContentItem[]): ContentItem[] {
  const iso = contentDateIso(c);
  return all.filter((o) => o.id !== c.id && o.b === c.b && contentDateIso(o) === iso);
}

/** One-line warning about same-day clashes, or null when the day is clear. */
export function sameDayWarning(c: ContentItem, all: ContentItem[]): string | null {
  const clash = sameDayPosts(c, all);
  if (!clash.length) return null;
  const names = clash.slice(0, 3).map((o) => `“${o.title || "ไม่มีชื่อ"}” (${o.time || "—"})`).join(" · ");
  const more = clash.length > 3 ? ` และอีก ${clash.length - 3} โพสต์` : "";
  return `วันนี้มีโพสต์ของแบรนด์เดียวกันอีก ${clash.length} รายการ: ${names}${more}`;
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
/** What captionStatus should become when a post is sent back BECAUSE OF the
 *  caption.
 *
 *  requestRevision already existed and works: it records the reason, counts the
 *  round, raises a task for the writer and notifies them. What it never did was
 *  move captionStatus — so a reviewer could send a post back saying the caption
 *  was wrong while the post went on displaying "Caption: Ready", and
 *  contentApproveBlockers still considered the caption fine. The writer had a
 *  task telling them to fix something the app insisted was already done.
 *
 *  Missing is preserved rather than promoted to Draft: no caption text at all
 *  is a different state from "written, not good enough", and overwriting it
 *  would lose that. */
export function captionStatusAfterRevision(c: Pick<ContentItem, "caption">): string {
  return (c.caption ?? "").trim() ? "Draft" : "Missing";
}

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
