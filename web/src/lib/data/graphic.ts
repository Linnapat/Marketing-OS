// Graphic / Creative Request — ported from Graphic.dc.html. Requests carry the full
// workflow schema (brief completeness, blocker, versions, feedback thread) so the board,
// list, and 6-tab detail drawer all read from one shape.

import { BrandId, brandName } from "@/lib/brands";
import { Tone } from "@/lib/status";

export interface GraphicEvent {
  type: "requested" | "assigned" | "submitted" | "revision_requested" | "approved" | "delivered"
    | "brief_approved" | "brief_revision_requested";
  at: string;
  by: string;
  deliverableKey?: string;
  note?: string;
}

export interface Graphic {
  id: number;
  stage: string;
  title: string;
  b: BrandId;
  campaign: string;
  due: string;
  dueIso?: string;
  designer: string;
  requester: string;
  approver: string;
  type: string;
  /** The content item asked for video work. The type string alone can't say so
   *  ("Photo" + Needs Video is video work) — this flag keeps the request counted
   *  under VDO in the Artwork report and the day-load calendar. */
  requiredVideo?: boolean;
  priority: "High" | "Med" | "Low";
  fb: number;
  openFb: number;
  isOverdue: boolean;
  briefComplete: boolean;
  pendingApprover: string;
  blocker: string | null;
  waitingSince: string | null;
  nextAction: string;
  platform: string;
  size: string;
  contentItem: string;
  /** Creative brief detail carried from Campaign / Content. Optional so older
   *  saved requests continue to work while newer requests can show the real
   *  brief pack in the drawer. */
  briefLink?: string;
  /** Content-leader brief sign-off — set by Approve Brief in the drawer. */
  briefApprovedBy?: string;
  briefApprovedAt?: string;
  objective?: string;
  keyMessage?: string;
  moodDirection?: string;
  referenceLink?: string;
  /** Google Drive link carried over from the content brief. */
  driveLink?: string;
  captionCopy?: string;
  extraDetails?: string;
  /** Per-asset deliverables (Platform × Asset Size from the content brief).
   *  The graphic team submits a link per row; the requester approves per row. */
  deliverables?: GraphicDeliverable[];
  /** Legacy single-link submit (kept for back-compat with older rows). */
  deliverableLink?: string;
  sourceLink?: string;
  submittedBy?: string;
  submittedAt?: string;
  /** Real relational links: campaignId + the content item this graphic serves
   *  (sourceContentItemId). The pair is the idempotency key so re-running a
   *  Submit doesn't fan out duplicate requests. */
  campaignId?: string;
  sourceContentItemId?: string;
  history?: GraphicEvent[];
}

export interface GraphicDeliverable {
  platform: string;
  size: string;
  refLink: string;          // reference brief link carried from the content item
  assetLink: string;
  sourceLink: string;
  status: string;           // Not submitted | Waiting review | Revision | Approved
  version: number;
  submittedBy: string;
  submittedAt: string;
  feedback: { reason: string; by: string; at: string }[];
  /** Manual artwork grouping (option 2): deliverables sharing the same number
   *  are ONE artwork (e.g. one master exported to several ratios). Blank = auto:
   *  counted by distinct size, platform collapsed (option 1). */
  artworkNo?: number;
}

export function emptyDeliverable(platform: string, size: string, refLink = ""): GraphicDeliverable {
  return { platform, size, refLink, assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [] };
}

/** For graphics created before deliverables existed, derive rows from the
 *  request's platform + size fields so the deliverable board still works. */
export function deriveDeliverables(g: Graphic): GraphicDeliverable[] {
  const plats = (g.platform || "").split(/[+,/]/).map((s) => s.trim()).filter(Boolean);
  const sizes = (g.size || "").split(/[·,]/).map((s) => s.trim()).filter(Boolean);
  const list = plats.length ? plats : ["Asset"];
  return autoNumberDeliverables(list.map((p, i) => emptyDeliverable(p, sizes.length === list.length ? sizes[i] : (sizes.join(" · ") || "—"))));
}

/** Assign artwork numbers automatically from the sizes chosen at request time:
 *  deliverables sharing a (normalised) size are ONE artwork — the same master
 *  file resized per platform — numbered 1..n in order of first appearance.
 *  Numbers already set by hand (legacy rows) are respected, and new sizes
 *  continue counting after the highest existing number. */
export function autoNumberDeliverables(dels: GraphicDeliverable[]): GraphicDeliverable[] {
  const bySize = new Map<string, number>();
  let next = dels.reduce((max, d) => Math.max(max, d.artworkNo ?? 0), 0);
  for (const d of dels) {
    if (d.artworkNo) { bySize.set(normSize(d.size), d.artworkNo); }
  }
  return dels.map((d) => {
    if (d.artworkNo) return d;
    const key = normSize(d.size);
    if (!bySize.has(key)) bySize.set(key, ++next);
    return { ...d, artworkNo: bySize.get(key) };
  });
}

/** Progress rollup for a request's deliverables. */
export function deliverableProgress(g: Graphic) {
  const d = g.deliverables ?? [];
  const submitted = d.filter((x) => x.status !== "Not submitted").length;
  const approved = d.filter((x) => x.status === "Approved").length;
  return { total: d.length, submitted, approved, ready: d.length > 0 && approved === d.length };
}

// ── Daily request capacity guard ──────────────────────────────────────────
// Each work TYPE can be requested at most this many times per due-date, so the
// creative/production team is never overloaded on a single day.
export const DAILY_WORK_CAP = 3;
export type WorkKind = "graphic" | "vdo" | "vdo_shoot" | "photo_shoot";
// The team's own words: VDO work is either งานถ่าย (a shoot) or งานตัด (an
// edit) — the rates differ, so the labels keep them apart everywhere counts
// are shown. "vdo" is the edit kind: a Reel/Short/VDO request is cutting work.
export const WORK_KIND_LABEL: Record<WorkKind, string> = {
  graphic: "Graphic",
  vdo: "VDO · งานตัด",
  vdo_shoot: "VDO · งานถ่าย",
  photo_shoot: "Photo · งานถ่าย",
};

/** Classify a request into one of the four capped work kinds. */
export function workKind(type: string, requiredVideo = false): WorkKind {
  const t = (type || "").toLowerCase();
  if (/photo shoot|photo shooting/.test(t)) return "photo_shoot";
  if (/vdo shooting|video shoot/.test(t)) return "vdo_shoot";
  if (requiredVideo || /vdo|video|reel|short/.test(t)) return "vdo";
  return "graphic";
}

/** Size key used to decide whether two deliverables are the same piece of
 *  artwork. Exported because the artwork report must group by exactly the same
 *  rule the app counts by — two answers to "how many pieces" is one too many. */
export const normSize = (s: string) => (s || "—").trim().toLowerCase().replace(/\s+/g, " ");

/** How many distinct ARTWORK pieces a request represents.
 *  Option 1 (auto): distinct size, platform collapsed — same size on FB & IG is
 *  one file; different sizes are separate work.
 *  Option 2 (manual): deliverables sharing an artworkNo count as one, so a master
 *  exported to several ratios is a single piece. */
export function artworkUnits(g: Pick<Graphic, "deliverables" | "platform" | "size">): number {
  const dels = g.deliverables?.length ? g.deliverables : deriveDeliverables(g as Graphic);
  if (!dels.length) return 1;
  const seen = new Set<string>();
  for (const d of dels) seen.add(d.artworkNo ? `n:${d.artworkNo}` : `s:${normSize(d.size)}`);
  return Math.max(1, seen.size);
}

/** Artwork pieces of `kind` already booked on `dueIso` — the sum of each
 *  request's artworkUnits, so the daily cap counts real pieces, not requests. */
export function countWorkOnDay(graphics: Graphic[], kind: WorkKind, dueIso: string): number {
  if (!dueIso) return 0;
  return graphics
    .filter((g) => (g.dueIso || "").slice(0, 10) === dueIso && workKind(g.type, g.requiredVideo) === kind)
    .reduce((sum, g) => sum + artworkUnits(g), 0);
}

/** Artwork units a set of asset targets (platform×size pairs) would add — used
 *  before a request exists, so the request modal can weigh it against the cap. */
export function artworkUnitsOf(assets: { size?: string }[]): number {
  if (!assets.length) return 1;
  const seen = new Set<string>();
  for (const a of assets) seen.add(`s:${normSize(a.size || "—")}`);
  return Math.max(1, seen.size);
}

/** Derive the request stage from its deliverables (values stay within STAGE_ORDER). */
export function stageFromDeliverables(g: Graphic): string {
  const d = g.deliverables ?? [];
  if (!d.length) return g.stage;
  if (d.every((x) => x.status === "Approved")) return "Approved";
  if (d.some((x) => x.status === "Revision")) return "Revision Requested";
  if (d.some((x) => x.status === "Waiting review")) return "Waiting Feedback";
  return "New Request";
}

/** One-click approve from the board/list: approves every deliverable still
 *  "Waiting review" (with history entries) so the approver doesn't have to
 *  dig into the drawer. Returns null when nothing is waiting. */
export function approveAllWaiting(g: Graphic, by: string): Graphic | null {
  const dels = g.deliverables?.length ? g.deliverables : deriveDeliverables(g);
  let targets = dels.filter((d) => d.status === "Waiting review");
  // Requests parked in "Waiting Feedback" without per-deliverable review
  // states (legacy rows): approving means everything not yet approved.
  if (!targets.length && g.stage === "Waiting Feedback") {
    targets = dels.filter((d) => d.status !== "Approved");
  }
  if (!targets.length) return null;
  const at = new Date().toISOString();
  const next = dels.map((d) => (targets.includes(d) ? { ...d, status: "Approved" as const } : d));
  return {
    ...g,
    deliverables: next,
    stage: stageFromDeliverables({ ...g, deliverables: next }),
    openFb: 0,
    history: [
      ...(g.history ?? []),
      ...targets.map((d) => ({ type: "approved" as const, at, by, deliverableKey: `${d.platform}::${d.size}` })),
    ],
  };
}

/** Submit ONE deliverable for review — the per-piece counterpart of
 *  approveAllWaiting. Used by the Agency Portal; GraphicDrawer still carries an
 *  equivalent inline version tied to its own local state (it records the same
 *  history event, so counts agree — but the two should be unified).
 *
 *  Submitting per deliverable (not per request) is what makes the work
 *  countable: a request for 1:1 + 4:5 + 9:16 is three pieces of artwork, and
 *  whoever made them is paid per piece. A single link stamped on the request
 *  would leave the other two sitting at "Not submitted" forever, so they would
 *  never be approved, never be counted, and never be paid.
 *
 *  Returns null when there is nothing to submit (no such deliverable, or no
 *  artwork link on it yet). */
export function submitDeliverable(
  g: Graphic,
  index: number,
  by: string,
  patch: { assetLink?: string; sourceLink?: string } = {},
): Graphic | null {
  const dels = (g.deliverables?.length ? g.deliverables : deriveDeliverables(g)).map((d) => ({ ...d }));
  const target = dels[index];
  if (!target) return null;

  const assetLink = (patch.assetLink ?? target.assetLink ?? "").trim();
  if (!assetLink) return null; // nothing to review yet

  const at = new Date().toISOString();
  dels[index] = {
    ...target,
    assetLink,
    sourceLink: patch.sourceLink ?? target.sourceLink,
    status: "Waiting review",
    version: target.version + 1,
    submittedBy: by,
    submittedAt: at,
  };

  return {
    ...g,
    deliverables: dels,
    stage: stageFromDeliverables({ ...g, deliverables: dels }),
    history: [
      ...(g.history ?? []),
      { type: "submitted" as const, at, by, deliverableKey: `${target.platform}::${target.size}` },
    ],
  };
}

const BOARD: { col: string; cards: Omit<Graphic, "stage">[] }[] = [
  { col: "New Request", cards: [
    { id: 0, title: "Songkran key visual", b: "teppen", campaign: "Songkran Teppanyaki", due: "Jul 2", designer: "Unassigned", requester: "Ken S.", approver: "Aran P.", type: "Key Visual", priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: false, pendingApprover: "—", blocker: "Brief incomplete", waitingSince: "Jun 28", nextAction: "Fill brief to proceed", platform: "IG + FB", size: "1080×1080 · 1920×1080", contentItem: "Songkran hero post" },
    { id: 1, title: "Anniversary poster", b: "touka", campaign: "Touka Anniversary", due: "Jul 8", designer: "Unassigned", requester: "Ploy R.", approver: "Aran P.", type: "Print", priority: "Med", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: "Jun 30", nextAction: "Assign designer", platform: "Print · in-store", size: "A3 portrait", contentItem: "—" },
    { id: 2, title: "Rainy season promo banner", b: "mainichi", campaign: "Rainy Season Promo", due: "Jul 3", designer: "Unassigned", requester: "Nok W.", approver: "Ken S.", type: "Social Media", priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: false, pendingApprover: "—", blocker: "Brief incomplete", waitingSince: "Jun 29", nextAction: "Complete brief then assign", platform: "IG + FB Feed", size: "1080×1080", contentItem: "Rainy season main post" },
  ]},
  { col: "In Progress", cards: [
    { id: 3, title: "Wagyu menu board", b: "teppen", campaign: "Wagyu Festival", due: "Jun 29", designer: "Boss", requester: "Ken S.", approver: "Aran P.", type: "In-Store", priority: "High", fb: 1, openFb: 0, isOverdue: true, briefComplete: true, pendingApprover: "Ken S.", blocker: "Waiting requester review", waitingSince: "Jun 27", nextAction: "Upload V2 for review", platform: "In-store · A2 board", size: "594×420mm", contentItem: "Menu board display", deliverables: [
      { platform: "Instagram", size: "1:1 (1080×1080)", refLink: "https://brief.example/wagyu", assetLink: "https://drive.example/wagyu-ig-1x1.png", sourceLink: "", status: "Approved", version: 2, submittedBy: "Boss", submittedAt: "2026-06-28T10:00:00Z", feedback: [] },
      { platform: "Instagram", size: "9:16 (1080×1920)", refLink: "https://brief.example/wagyu", assetLink: "https://figma.example/wagyu-story", sourceLink: "", status: "Waiting review", version: 1, submittedBy: "Boss", submittedAt: "2026-06-29T09:00:00Z", feedback: [] },
      { platform: "Facebook", size: "16:9 (1200×628)", refLink: "https://brief.example/wagyu", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [] },
    ] },
    // Outsourced to an external studio — this is the row that shows the Agency
    // Portal flow in demo mode: three sizes = three pieces, submitted one by one.
    { id: 4, title: "Lunch set carousel", b: "mainichi", campaign: "Rainy Season Promo", due: "Jun 28", designer: "Studio Nine", requester: "Nok W.", approver: "Ken S.", type: "Social Media", priority: "Med", fb: 0, openFb: 0, isOverdue: true, briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: "Jun 25", nextAction: "Complete V1 design", platform: "IG Carousel", size: "1080×1080 ×5", contentItem: "Lunch promotion carousel", deliverables: [
      { platform: "Instagram", size: "1:1 (1080×1080)", refLink: "https://brief.example/lunch", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [] },
      { platform: "Instagram", size: "4:5 (1080×1350)", refLink: "https://brief.example/lunch", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [] },
      { platform: "Facebook", size: "1:1 (1080×1080)", refLink: "https://brief.example/lunch", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [] },
    ] },
    { id: 5, title: "Cocktail hour reel cover", b: "touka", campaign: "Cocktail Hour Launch", due: "Jul 1", designer: "Boss", requester: "Ploy R.", approver: "Ploy R.", type: "Reel Cover", priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: "Jun 28", nextAction: "Design in progress", platform: "IG Reels", size: "1080×1920", contentItem: "Cocktail reel thumbnail" },
  ]},
  { col: "Waiting Feedback", cards: [
    { id: 6, title: "Father's Day banner", b: "omakase", campaign: "Father's Day Set", due: "Jun 28", designer: "Boss", requester: "Ken S.", approver: "Aran P.", type: "Social Media", priority: "High", fb: 2, openFb: 2, isOverdue: true, briefComplete: true, pendingApprover: "Ken S.", blocker: "Waiting requester feedback", waitingSince: "Jun 26", nextAction: "Ken S. to review V2", platform: "FB + IG Feed", size: "1200×628 · 1080×1080", contentItem: "Father's Day main post" },
    { id: 7, title: "LINE OA coupon card", b: "mainichi", campaign: "LINE Coupon Drive", due: "Jun 27", designer: "Aom", requester: "Nok W.", approver: "Ken S.", type: "LINE Rich Message", priority: "Med", fb: 1, openFb: 1, isOverdue: true, briefComplete: true, pendingApprover: "Nok W.", blocker: "Waiting requester feedback", waitingSince: "Jun 25", nextAction: "Nok W. to approve card design", platform: "LINE OA", size: "1200×630", contentItem: "Coupon redemption card" },
  ]},
  { col: "Revision Requested", cards: [
    { id: 8, title: "Menu redesign", b: "touka", campaign: "Cocktail Hour Launch", due: "Jun 30", designer: "Aom", requester: "Ploy R.", approver: "Aran P.", type: "Print", priority: "High", fb: 2, openFb: 2, isOverdue: true, briefComplete: true, pendingApprover: "Ploy R.", blocker: "Design revision needed", waitingSince: "Jun 24", nextAction: "Aom to revise V2 per feedback", platform: "Print · menu", size: "A5 folded", contentItem: "Cocktail menu card" },
    { id: 9, title: "Summer reel cover", b: "omakase", campaign: "Summer Reel Series", due: "Jun 26", designer: "Boss", requester: "Ken S.", approver: "Aran P.", type: "Reel Cover", priority: "High", fb: 3, openFb: 3, isOverdue: true, briefComplete: true, pendingApprover: "Ken S.", blocker: "CI correction needed", waitingSince: "Jun 22", nextAction: "Boss to revise brand colours V4", platform: "IG Reels", size: "1080×1920", contentItem: "Summer series cover" },
  ]},
  { col: "Waiting Approval", cards: [
    { id: 10, title: "Cocktail menu card", b: "touka", campaign: "Cocktail Hour Launch", due: "Jun 24", designer: "Aom", requester: "Ploy R.", approver: "Aran P.", type: "Print", priority: "Med", fb: 1, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "Aran P.", blocker: "Waiting CMO approval", waitingSince: "Jun 23", nextAction: "Aran P. to approve final artwork", platform: "Print", size: "A5", contentItem: "Menu card" },
  ]},
  { col: "Approved", cards: [
    { id: 11, title: "Wagyu teaser story", b: "teppen", campaign: "Wagyu Festival", due: "Jun 22", designer: "Studio Nine", requester: "Ken S.", approver: "Aran P.", type: "Story", priority: "Med", fb: 1, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: null, nextAction: "Upload final files for delivery", platform: "IG Story", size: "1080×1920 ×3", contentItem: "Wagyu teaser 3-frame story", deliverables: [
      { platform: "Instagram", size: "9:16 (1080×1920)", refLink: "", assetLink: "https://drive.example/wagyu-story-9x16.png", sourceLink: "", status: "Approved", version: 2, submittedBy: "Studio Nine", submittedAt: "2026-07-06T04:00:00Z", feedback: [{ reason: "โลโก้เล็กไป ขอใหญ่ขึ้น", by: "Ken S.", at: "2026-07-05T08:00:00Z" }] },
      { platform: "Instagram", size: "1:1 (1080×1080)", refLink: "", assetLink: "https://drive.example/wagyu-story-1x1.png", sourceLink: "", status: "Approved", version: 1, submittedBy: "Studio Nine", submittedAt: "2026-07-06T04:10:00Z", feedback: [] },
      { platform: "Facebook", size: "1:1 (1080×1080)", refLink: "", assetLink: "https://drive.example/wagyu-story-1x1.png", sourceLink: "", status: "Approved", version: 1, submittedBy: "Studio Nine", submittedAt: "2026-07-06T04:10:00Z", feedback: [] },
    ], history: [
      { type: "revision_requested", at: "2026-07-05T08:00:00Z", by: "Ken S.", deliverableKey: "Instagram::9:16 (1080×1920)", note: "โลโก้เล็กไป ขอใหญ่ขึ้น" },
      { type: "approved", at: "2026-07-07T03:00:00Z", by: "Ken S.", deliverableKey: "Instagram::9:16 (1080×1920)" },
      { type: "approved", at: "2026-07-07T03:00:00Z", by: "Ken S.", deliverableKey: "Instagram::1:1 (1080×1080)" },
      { type: "approved", at: "2026-07-07T03:00:00Z", by: "Ken S.", deliverableKey: "Facebook::1:1 (1080×1080)" },
    ] },
  ]},
  { col: "Delivered", cards: [
    { id: 12, title: "Matcha dessert post", b: "mainichi", campaign: "LINE Coupon Drive", due: "Jun 5", designer: "Boss", requester: "Nok W.", approver: "Ken S.", type: "Social Media", priority: "Low", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: null, nextAction: "—", platform: "IG Feed", size: "1080×1080", contentItem: "Dessert promo post" },
  ]},
];

export const STAGE_ORDER = ["New Request", "In Progress", "Waiting Feedback", "Revision Requested", "Waiting Approval", "Approved", "Delivered"];

export const GRAPHICS: Graphic[] = BOARD.flatMap((col) => col.cards.map((c) => ({ ...c, stage: col.col })));

export const STAGE_TONE: Record<string, Tone> = {
  "New Request": "neutral", "Brief Incomplete": "red", "Ready to Start": "neutral",
  "In Progress": "blue", "Waiting Feedback": "gold", "Revision Requested": "orange",
  "Waiting Approval": "gold", Approved: "green", Delivered: "ink", Cancelled: "neutral",
  Open: "red", Resolved: "green", "In progress": "blue", "Waiting reply": "gold",
  Pending: "gold", Rejected: "red",
};
export const stageTone = (s: string): Tone => STAGE_TONE[s] ?? "neutral";

export const PRIORITY_TONE: Record<string, Tone> = { High: "red", Med: "gold", Low: "neutral" };

export const DESIGNER_COLOR: Record<string, string> = { Boss: "#4E7A4E", Aom: "#B5577E", New: "#3E5C9A", Unassigned: "#9A9387" };

export interface Feedback {
  id: number; gid: number; owner: string; team: string; ownerColor: string;
  type: string; text: string; version: string; status: string; assignedTo: string; due: string | null; createdAt: string;
}

export const FEEDBACK: Feedback[] = [
  { id: 0, gid: 6, owner: "Ken S.", team: "Campaign Lead", ownerColor: "#3E5C9A", type: "Design revision", text: "Brand colours need adjustment — use Omakase navy (#3E5C9A) as dominant, not the current warm brown. Also the CTA button is too small on mobile.", version: "V2", status: "Open", assignedTo: "Boss", due: "Jun 29", createdAt: "Jun 27" },
  { id: 1, gid: 6, owner: "Ploy R.", team: "Brand Manager", ownerColor: "#B5577E", type: "Copy revision", text: "The headline copy needs to say 'Father's Day Omakase Set' not 'Special Set'. Brand guideline: always use the full name.", version: "V2", status: "Open", assignedTo: "Boss", due: "Jun 28", createdAt: "Jun 26" },
  { id: 2, gid: 7, owner: "Nok W.", team: "Performance", ownerColor: "#6b6258", type: "CI correction", text: "Coupon border colour is wrong — should match the warm gold from CI kit, not yellow. Please check the brand asset folder.", version: "V1", status: "Open", assignedTo: "Aom", due: "Jun 28", createdAt: "Jun 25" },
  { id: 3, gid: 8, owner: "Ploy R.", team: "Brand Manager", ownerColor: "#B5577E", type: "Design revision", text: "Cocktail photo angle is wrong — use the low-angle dramatic shot, not the top-down. Reference pinned in the asset folder.", version: "V1", status: "Open", assignedTo: "Aom", due: "Jun 29", createdAt: "Jun 24" },
  { id: 4, gid: 8, owner: "Aran P.", team: "CMO", ownerColor: "#B8945A", type: "Approval comment", text: "Good direction. Once Ploy's feedback is addressed in V2, send me for CMO sign-off.", version: "V1", status: "Resolved", assignedTo: "Aom", due: null, createdAt: "Jun 23" },
  { id: 5, gid: 9, owner: "Ken S.", team: "Campaign Lead", ownerColor: "#3E5C9A", type: "CI correction", text: "Reel cover has the wrong font — must use Cormorant for headlines, not Playfair. Check CI guidelines.", version: "V3", status: "Open", assignedTo: "Boss", due: "Jun 27", createdAt: "Jun 22" },
  { id: 6, gid: 9, owner: "Ploy R.", team: "Brand Manager", ownerColor: "#B5577E", type: "Design revision", text: "Background too dark — Omakase brand requires at least 30% lighter dark navy. Current version feels too heavy.", version: "V3", status: "Open", assignedTo: "Boss", due: "Jun 26", createdAt: "Jun 22" },
  { id: 7, gid: 9, owner: "Ken S.", team: "Campaign Lead", ownerColor: "#3E5C9A", type: "General comment", text: "V1 and V2 direction was wrong — we needed it simpler. V3 is closer, just the colour + font corrections.", version: "V3", status: "Open", assignedTo: "Boss", due: "Jun 28", createdAt: "Jun 23" },
];

export interface Version {
  gid: number; name: string; uploadedBy: string; uploadedAt: string;
  feedbackCount: number; approvalStatus: string; isLatest: boolean;
}

export const VERSIONS: Version[] = [
  { gid: 3, name: "V1 — Draft", uploadedBy: "Boss", uploadedAt: "Jun 25", feedbackCount: 1, approvalStatus: "Needs revision", isLatest: false },
  { gid: 3, name: "V2 — In review", uploadedBy: "Boss", uploadedAt: "Jun 27", feedbackCount: 0, approvalStatus: "Awaiting review", isLatest: true },
  { gid: 6, name: "V1 — Draft", uploadedBy: "Boss", uploadedAt: "Jun 24", feedbackCount: 1, approvalStatus: "Revision requested", isLatest: false },
  { gid: 6, name: "V2 — Revised", uploadedBy: "Boss", uploadedAt: "Jun 26", feedbackCount: 2, approvalStatus: "Waiting feedback", isLatest: true },
  { gid: 8, name: "V1 — Draft", uploadedBy: "Aom", uploadedAt: "Jun 22", feedbackCount: 2, approvalStatus: "Revision requested", isLatest: true },
  { gid: 9, name: "V1", uploadedBy: "Boss", uploadedAt: "Jun 18", feedbackCount: 2, approvalStatus: "Rejected", isLatest: false },
  { gid: 9, name: "V2", uploadedBy: "Boss", uploadedAt: "Jun 20", feedbackCount: 1, approvalStatus: "Rejected", isLatest: false },
  { gid: 9, name: "V3", uploadedBy: "Boss", uploadedAt: "Jun 22", feedbackCount: 3, approvalStatus: "Revision requested", isLatest: true },
  { gid: 10, name: "Final — Approved", uploadedBy: "Aom", uploadedAt: "Jun 23", feedbackCount: 0, approvalStatus: "Approved", isLatest: true },
  { gid: 11, name: "Final", uploadedBy: "Boss", uploadedAt: "Jun 21", feedbackCount: 1, approvalStatus: "Approved", isLatest: true },
  { gid: 12, name: "Final — Delivered", uploadedBy: "Boss", uploadedAt: "Jun 5", feedbackCount: 0, approvalStatus: "Approved", isLatest: true },
];

// (There was a hardcoded DESIGNERS list of mock names here. Designers are real
// people: read them from the Team Member master via OwnerSelect / memberTeam,
// the same source the assign control uses.)

const dueDateFromLabel = (label: string): Date | null => {
  const m = /^([A-Za-z]{3})\s+(\d{1,2})$/.exec((label || "").trim());
  if (!m) return null;
  const idx = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(m[1]);
  if (idx < 0) return null;
  return new Date(new Date().getFullYear(), idx, Number(m[2]), 23, 59, 59, 999);
};

/** The request's real due moment: dueIso when present, else the "Jul 2" label. */
function graphicDue(g: Graphic): Date | null {
  if (g.dueIso) { const d = new Date(`${g.dueIso}T23:59:59`); if (!isNaN(+d)) return d; }
  return dueDateFromLabel(g.due);
}

/** Live overdue — computed against today, never trusted from the stored flag:
 *  past due AND not yet finished (Approved/Delivered stop the clock). */
export function computeGraphicOverdue(g: Graphic, now: Date = new Date()): boolean {
  if (["Approved", "Delivered"].includes(g.stage)) return false;
  const due = graphicDue(g);
  return !!due && due.getTime() < now.getTime();
}

/** Refresh the stored isOverdue flag with the live computation. */
export const withLiveGraphicOverdue = (g: Graphic): Graphic => ({ ...g, isOverdue: computeGraphicOverdue(g) });

export function graphicMetrics(g: Graphic) {
  const history = g.history ?? [];
  const fallbackRevision = (g.deliverables ?? []).reduce((sum, d) => sum + d.feedback.length, 0);
  const revisionCount = history.filter((e) => e.type === "revision_requested").length || fallbackRevision;
  const rejectionCount = history.filter((e) => e.type === "revision_requested" && (e.note || "").toLowerCase().includes("reject")).length;
  const approvedCount = history.filter((e) => e.type === "approved").length || ((g.stage === "Approved" || g.stage === "Delivered") ? 1 : 0);
  const deliveredCount = history.filter((e) => e.type === "delivered").length || (g.stage === "Delivered" ? 1 : 0);
  const due = graphicDue(g);
  const lateSubmissionCount = due ? history.filter((e) => e.type === "submitted" && new Date(e.at).getTime() > due.getTime()).length : 0;
  const overdueCount = computeGraphicOverdue(g) ? 1 : 0;
  // On-plan KPI: the first finish moment (delivered, else approved) vs due.
  // 1 = finished on/before due, 0 = finished late, null = not finished yet or
  // no timestamp to judge (excluded from the rate).
  const finishedAt = history.find((e) => e.type === "delivered")?.at ?? history.find((e) => e.type === "approved")?.at;
  const onTime: 0 | 1 | null = due && finishedAt ? (new Date(finishedAt).getTime() <= due.getTime() ? 1 : 0) : null;
  return { revisionCount, rejectionCount, approvedCount, deliveredCount, lateSubmissionCount, overdueCount, onTime };
}

export function graphicKpis(list: Graphic[]) {
  return {
    total: list.length,
    inProgress: list.filter((g) => g.stage === "In Progress").length,
    waiting: list.filter((g) => g.stage === "Waiting Feedback").length,
    revisions: list.filter((g) => g.stage === "Revision Requested").length,
    approved: list.filter((g) => ["Approved", "Delivered"].includes(g.stage)).length,
    feedback: list.reduce((s, g) => s + g.openFb, 0),
    approvedCount: list.reduce((s, g) => s + graphicMetrics(g).approvedCount, 0),
    deliveredCount: list.reduce((s, g) => s + graphicMetrics(g).deliveredCount, 0),
    revisionRequests: list.reduce((s, g) => s + graphicMetrics(g).revisionCount, 0),
    lateSubmissions: list.reduce((s, g) => s + graphicMetrics(g).lateSubmissionCount, 0),
    overdueItems: list.reduce((s, g) => s + graphicMetrics(g).overdueCount, 0),
    // On-plan rate: of the finished-and-judgeable items, % finished on time.
    ...(() => {
      const judged = list.map((g) => graphicMetrics(g).onTime).filter((v): v is 0 | 1 => v !== null);
      return { onTimeDone: judged.reduce((s, v) => s + v, 0 as number), onTimeJudged: judged.length,
        onTimeRate: judged.length ? Math.round((judged.reduce((s, v) => s + v, 0 as number) / judged.length) * 100) : null };
    })(),
  };
}

export function graphicNeedsAttention(list: Graphic[]): Graphic[] {
  return list.filter((g) => g.isOverdue || !g.briefComplete || g.openFb > 0);
}

/** Brief completeness (0–100) for the Brief tab. */
export function briefFields(g: Graphic): { label: string; ok: boolean }[] {
  return [
    { label: "Objective", ok: g.briefComplete },
    { label: "Key message", ok: g.briefComplete },
    { label: "Platform / usage", ok: !!g.platform },
    { label: "Size / format", ok: !!g.size },
    { label: "CI / mood direction", ok: g.briefComplete },
    { label: "Reference link", ok: g.briefComplete },
    { label: "Linked content item", ok: g.contentItem !== "—" },
    { label: "Caption / copy", ok: g.briefComplete },
  ];
}

export function creativeBriefLink(g: Graphic): string {
  return g.briefLink || g.referenceLink || g.deliverables?.find((d) => d.refLink)?.refLink || "";
}

export function creativeBriefDetails(g: Graphic): { label: string; value: string; href?: string }[] {
  const briefLink = creativeBriefLink(g);
  return [
    { label: "Brief link", value: briefLink ? "Open creative brief" : "ยังไม่มี link brief", href: briefLink || undefined },
    { label: "Objective", value: g.objective || `${g.campaign} · ${g.type} for ${brandName(g.b)}` },
    // Key message must NOT fall back to nextAction — that's a workflow status
    // (e.g. "Design in progress"), not the creative message.
    { label: "Key message", value: g.keyMessage || "รอ requester เติม key message" },
    { label: "Platform / usage", value: g.platform || "—" },
    { label: "Size / format", value: g.size || "—" },
    { label: "CI / mood direction", value: g.moodDirection || `${brandName(g.b)} brand direction · keep CI, tone, logo and visual hierarchy consistent.` },
    { label: "Google Drive link", value: g.driveLink ? "เปิด Google Drive" : "ยังไม่มี Drive link", href: g.driveLink || undefined },
    { label: "Reference", value: (g.referenceLink || briefLink) ? "Open reference" : "ยังไม่มี reference link", href: g.referenceLink || briefLink || undefined },
    { label: "Linked content item", value: g.contentItem && g.contentItem !== "—" ? g.contentItem : "ยังไม่ link กับ Content Plan" },
    { label: "Caption / copy", value: g.captionCopy || "ยังไม่มี caption/copy เพิ่มเติม" },
    { label: "Additional details", value: g.extraDetails || g.blocker || "ไม่มีรายละเอียดเพิ่มเติม" },
  ];
}
