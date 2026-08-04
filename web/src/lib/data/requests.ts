// Request Center + Approval Queue + Asset Library — shared request/asset data,
// built from the Marketing OS v2 spec (central Request Center, 9-stage Approval
// pipeline, Asset Library with Drive/Canva links).

import { BrandId } from "@/lib/brands";
import { Tone } from "@/lib/status";

export const REQUEST_TYPES = [
  { key: "graphic", label: "Graphic", icon: "🎨" },
  { key: "content", label: "Content", icon: "✍️" },
  { key: "kol", label: "KOL", icon: "🌟" },
  { key: "campaign", label: "Campaign", icon: "🎯" },
  { key: "budget", label: "Budget", icon: "฿" },
  { key: "photo", label: "Photo / Video Shooting", icon: "📸" },
  { key: "report", label: "Report", icon: "📊" },
  { key: "menu", label: "Menu / Promotion Brief", icon: "🍱" },
];

export interface RequestRow {
  id: string;
  type: string;
  typeIcon: string;
  title: string;
  b: BrandId;
  campaign: string;
  /** Link to the campaign row. The `campaign` name beside it is for reading;
   *  this is what joins, and what survives a rename. */
  campaignId?: string;
  requester: string;
  approver: string;
  due: string;
  stage: string;
  priority: "High" | "Med" | "Low";
  /** Reject / send-back history logged from the Approval Queue. */
  feedback?: { stage: string; reason: string; by: string; at: string }[];
}

export const REQUESTS: RequestRow[] = [
  { id: "REQ-0001", type: "Graphic", typeIcon: "🎨", title: "Songkran key visual", b: "teppen", campaign: "Songkran Teppanyaki", requester: "Ken S.", approver: "Aran P.", due: "Jul 2", stage: "CMO Review", priority: "High" },
  { id: "REQ-0002", type: "Budget", typeIcon: "฿", title: "Rainy Season media budget", b: "mainichi", campaign: "Rainy Season Promo", requester: "Nok W.", approver: "Aran P.", due: "Jul 3", stage: "Submitted", priority: "High" },
  { id: "REQ-0003", type: "KOL", typeIcon: "🌟", title: "Tokyo Tom contract", b: "teppen", campaign: "Wagyu Festival", requester: "Ken S.", approver: "Aran P.", due: "Jul 5", stage: "Revision", priority: "Med" },
  { id: "REQ-0004", type: "Content", typeIcon: "✍️", title: "Cocktail reel caption set", b: "touka", campaign: "Cocktail Hour Launch", requester: "Ploy R.", approver: "Ken S.", due: "Jul 4", stage: "Approved", priority: "Med" },
  { id: "REQ-0005", type: "Photo / Video Shooting", typeIcon: "📸", title: "Father's Day menu shoot", b: "omakase", campaign: "Father's Day Set", requester: "Ken S.", approver: "Aran P.", due: "Jun 28", stage: "Scheduled", priority: "Low" },
  { id: "REQ-0006", type: "Campaign", typeIcon: "🎯", title: "Touka Anniversary plan", b: "touka", campaign: "Touka Anniversary", requester: "Ploy R.", approver: "Aran P.", due: "Aug 1", stage: "Draft", priority: "Med" },
  { id: "REQ-0007", type: "Report", typeIcon: "📊", title: "LINE Coupon post-mortem", b: "mainichi", campaign: "LINE Coupon Drive", requester: "Nok W.", approver: "Aran P.", due: "Jun 20", stage: "Reported", priority: "Low" },
  { id: "REQ-0008", type: "Graphic", typeIcon: "🎨", title: "Wagyu key visual V2", b: "teppen", campaign: "Wagyu Festival", requester: "Ken S.", approver: "Aran P.", due: "Jun 29", stage: "Published", priority: "High" },
  { id: "REQ-0009", type: "Menu / Promotion Brief", typeIcon: "🍱", title: "Summer set menu brief", b: "omakase", campaign: "Summer Reel Series", requester: "Ken S.", approver: "Ken S.", due: "Jul 6", stage: "Result Uploaded", priority: "Med" },
];

// 9-stage approval pipeline
export const APPROVAL_STAGES = [
  "Draft", "Submitted", "CMO Review", "Revision", "Approved",
  "Scheduled", "Published", "Result Uploaded", "Reported",
];

export const STAGE_TONE: Record<string, Tone> = {
  Draft: "neutral", Submitted: "blue", "CMO Review": "gold", Revision: "orange",
  Approved: "green", Scheduled: "blue", Published: "green", "Result Uploaded": "blue", Reported: "ink",
};

export const PRIORITY_TONE: Record<string, Tone> = { High: "red", Med: "gold", Low: "neutral" };

// ── Asset Library ──────────────────────────────────────────────────
export interface Asset {
  id: string;
  name: string;
  b: BrandId;
  campaign: string;
  type: string;
  version: string;
  approval: string;
  driveUrl: string;
  canvaUrl: string;
  updated: string;
  /** Image shown on the card. Optional — assetPreviewSrc falls back to a
   *  thumbnail derived from the Drive / Dropbox link when it is empty. */
  previewUrl?: string;
}

/** Is this link a FOLDER rather than a single file?
 *
 *  A folder has no thumbnail, and pretending otherwise is worse than showing
 *  none: the card renders a broken image where a placeholder would have said
 *  "open it". Dropbox spells the difference in the path — /scl/fi/ and /s/ are
 *  files, /scl/fo/ and /sh/ are folders — and Drive uses /folders/.
 *
 *  This is what the team's asset links actually are: three of the four assets
 *  in the library are Dropbox photo FOLDERS, which is why no preview ever
 *  appeared. */
export function isFolderLink(url: string): boolean {
  const u = (url || "").trim();
  return /dropbox\.com\/(sh|scl\/fo)\//i.test(u) || /drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\//i.test(u);
}

/** A Dropbox FILE link, rewritten so an <img> can render it.
 *
 *  Two things the old one-liner got wrong. It matched /scl/ without checking
 *  fi vs fo, so every photo folder produced a URL that could only ever 404 —
 *  and it dropped the query string, which on a /scl/ link removes `rlkey`, the
 *  token the link needs to be readable at all. Keeping the query and adding
 *  raw=1 is what actually renders.
 *
 *  Returns "" for folders and for anything that is not a Dropbox share link. */
export function dropboxImageSrc(url: string): string {
  const u = (url || "").trim();
  if (isFolderLink(u)) return "";
  if (!/dropbox\.com\/(s|scl\/fi)\//i.test(u)) return "";
  const [path, query = ""] = u.split("#")[0].split("?");
  const params = new URLSearchParams(query);
  params.delete("dl");     // dl=0 opens the viewer page; dl=1 downloads
  params.set("raw", "1");  // raw=1 serves the bytes
  return `${path}?${params.toString()}`;
}

/** Google Drive / Dropbox share links point at a viewer page, not an image.
 *  Rewrite the ones that have a known direct form so pasting the same link the
 *  team already keeps is enough to get a thumbnail. Returns "" when the link
 *  cannot be turned into an image (a folder on either host, a Canva design, a
 *  private `dropbox.com/home/…` path) — the card then falls back to its
 *  placeholder, which is the honest answer. */
export function assetPreviewSrc(a: Pick<Asset, "previewUrl" | "driveUrl">): string {
  // An explicit thumbnail still has to be an image. The one asset in the
  // library with a previewUrl had a /home/ viewer path pasted into it, so the
  // card trusted it and rendered a broken image — worse than the placeholder
  // it was overriding.
  const explicit = (a.previewUrl ?? "").trim();
  if (explicit && !isFolderLink(explicit) && !/dropbox\.com\/home\//i.test(explicit)) {
    return dropboxImageSrc(explicit) || explicit;
  }
  const url = (a.driveUrl ?? "").trim();
  if (!url || url === "#") return "";
  if (isFolderLink(url)) return "";
  // Dropbox first, before the file-extension shortcut: a share link ending
  // ".jpg" still serves the viewer PAGE unless raw=1 is on it, so trusting the
  // extension returns a URL that renders as nothing.
  const dropbox = dropboxImageSrc(url);
  if (dropbox) return dropbox;
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) return url;
  const drive = /drive\.google\.com\/(?:file\/d\/([\w-]{10,})|.*[?&]id=([\w-]{10,}))/.exec(url);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1] ?? drive[2]}&sz=w600`;
  return "";
}

/** Sort key for "newest first".
 *
 *  There is no date to sort on: `updated` is free text and holds "Jun 27",
 *  "2026-08-01" and "just now" all at once, so comparing it sorts nothing.
 *  The row id is a serial, so id order IS the order things were filed —
 *  the honest answer to "which campaign is newest" until assets get a real
 *  created_at. Handles both "AST-003" and a bare "12". */
export function assetSeq(a: Pick<Asset, "id">): number {
  const digits = String(a.id).match(/\d+/g);
  return digits ? Number(digits[digits.length - 1]) : 0;
}

/** Campaigns with their assets, newest campaign first. A campaign counts as
 *  new by its most recently filed asset, not its name or its oldest piece. */
export function assetsByCampaign(rows: Asset[]): [string, Asset[]][] {
  const groups = new Map<string, Asset[]>();
  for (const a of rows) {
    const key = a.campaign || "—";
    const list = groups.get(key);
    if (list) list.push(a); else groups.set(key, [a]);
  }
  for (const list of groups.values()) list.sort((x, y) => assetSeq(y) - assetSeq(x));
  return [...groups.entries()].sort((x, y) => assetSeq(y[1][0]) - assetSeq(x[1][0]));
}

export const ASSETS: Asset[] = [
  { id: "AST-001", name: "Wagyu Key Visual", b: "teppen", campaign: "Wagyu Festival", type: "Key Visual", version: "V2", approval: "Approved", driveUrl: "#", canvaUrl: "#", updated: "Jun 27" },
  { id: "AST-002", name: "Wagyu Teaser Story", b: "teppen", campaign: "Wagyu Festival", type: "Story", version: "Final", approval: "Approved", driveUrl: "#", canvaUrl: "#", updated: "Jun 21" },
  { id: "AST-003", name: "Cocktail Menu Card", b: "touka", campaign: "Cocktail Hour Launch", type: "Print", version: "Final", approval: "Approved", driveUrl: "#", canvaUrl: "", updated: "Jun 23" },
  { id: "AST-004", name: "Father's Day Banner", b: "omakase", campaign: "Father's Day Set", type: "Social Media", version: "V2", approval: "Waiting", driveUrl: "#", canvaUrl: "#", updated: "Jun 26" },
  { id: "AST-005", name: "Summer Reel Cover", b: "omakase", campaign: "Summer Reel Series", type: "Reel Cover", version: "V3", approval: "Revision", driveUrl: "#", canvaUrl: "#", updated: "Jun 22" },
  { id: "AST-006", name: "Lunch Set Carousel", b: "mainichi", campaign: "Rainy Season Promo", type: "Carousel", version: "V1", approval: "Draft", driveUrl: "", canvaUrl: "#", updated: "Jun 25" },
  { id: "AST-007", name: "Matcha Dessert Post", b: "mainichi", campaign: "LINE Coupon Drive", type: "Social Media", version: "Final", approval: "Approved", driveUrl: "#", canvaUrl: "#", updated: "Jun 5" },
  { id: "AST-008", name: "LINE Coupon Card", b: "mainichi", campaign: "LINE Coupon Drive", type: "LINE Rich Message", version: "V1", approval: "Waiting", driveUrl: "#", canvaUrl: "", updated: "Jun 25" },
];

export const ASSET_APPROVAL_TONE: Record<string, Tone> = {
  Approved: "green", Waiting: "gold", Revision: "orange", Draft: "neutral",
};
