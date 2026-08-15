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
  "Facebook", "Instagram", "TikTok", "LINE OA", "Google Business Profile", "In-store", "Delivery",
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
  // Delivery has no fixed spec — deliberately absent, see needsAssetSize below.
};
export const assetSizesFor = (platform: string): string[] => ASSET_SIZES[platform] ?? [];

/** A platform only needs an asset size when it actually has sizes to choose
 * from. Delivery has none, and requiring one there would be a dead end: the
 * dropdown would be empty, so Submit could never be satisfied and the only way
 * out would be to deselect the platform. Keyed off the size list rather than a
 * platform name so any future spec-less platform behaves the same. */
export const needsAssetSize = (platform: string): boolean => assetSizesFor(platform).length > 0;

/** The Visit goal a planner typed into the brief (auto = Reach × CV%). Goals are
 * stored as free text, so this tolerates "12,000", blanks and junk, and answers
 * 0 for anything it can't read — a bad parse must never surface as NaN in a
 * column or poison a group total. */
export function visitGoalOf(brief: Pick<CampaignBrief, "successGoals"> | undefined): number {
  const n = parseFloat(String(brief?.successGoals?.["Visit"] ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const KOL_TYPES = [
  "Foodie", "Lifestyle", "Office Worker", "Japanese Food", "Family", "Micro", "Nano", "Macro",
] as const;

export const KOL_PLATFORMS = ["Instagram", "TikTok", "Facebook", "YouTube", "LINE VOOM"] as const;
export const KOL_CONTENT = ["Reel", "Story", "Post", "TikTok"] as const;

export const CHANNELS = [
  "Facebook", "Instagram", "TikTok", "LINE OA", "Google", "In-store", "CRM / LINE OA", "Delivery",
] as const;

export const ADS_PLATFORMS = ["Facebook / Instagram", "TikTok", "Google", "LINE Ads", "Delivery (Grab/Line etc)", "Other"] as const;

export const PRIORITIES = ["High", "Med", "Low"] as const;

// Every status a campaign can be in — and the ONLY list any status picker may
// offer. The Campaigns list used to carry its own set ("Active", "Paused",
// "Inactive", "Waiting Approval" — one word short of the real thing), so a CMO
// could park a campaign on a value nothing else in the app recognises: not
// past-approval, so its plan never became work, and not waiting either, so no
// approval queue ever showed it. "Unlimited Side Dish" sat on "Active" with 3
// planned items and 0 posts because of it.
export const BRIEF_STATUSES = [
  "Draft", "Ready for Review", "Waiting for Approval",
  "Approved", "Need Revision", "In Progress", "Completed", "Cancelled",
] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

/** Statuses at or past CMO approval — the point where Submit turns the plan
 *  into real posts, graphic requests and tasks. "Need Revision" is deliberately
 *  NOT here: it is sent back before anything is created. */
const MATERIALISED_STATUSES: readonly string[] = ["Approved", "In Progress", "Completed"];

/** Has this campaign's plan been turned into real work yet?
 *
 *  Used to decide whether an empty Content tab means "not created yet" (show
 *  the plan) or "created and then deleted" (show nothing). Reading it off the
 *  brief's own status rather than counting live posts matters: counting posts
 *  makes a campaign whose posts were ALL deleted look like it was never
 *  approved, and the deleted rows come back on screen as plan items. */
export function materialised(brief: { status?: string } | null | undefined): boolean {
  return !!brief?.status && MATERIALISED_STATUSES.includes(brief.status);
}

/** Items in the plan that are worth turning into posts — a row with no title is
 *  a half-typed line, not a piece of work. */
export function plannedItems(brief: { content?: { title?: string }[] } | null | undefined) {
  return (brief?.content ?? []).filter((ci) => (ci.title ?? "").trim());
}

/** A campaign that says it is approved while none of its plan was ever made.
 *
 *  Approval is what turns the plan into posts, graphic requests and tasks, so
 *  the two normally move together and `materialised` reads the status alone.
 *  When they come apart the status is the thing that lies: a campaign approved,
 *  a fan-out that did not finish, and a Content tab that — trusting the status
 *  — reported "No content planned" over a plan of seven items sitting right
 *  there in the brief. Reported as "content ที่ดราฟไว้ไม่ขึ้น", which is
 *  exactly what it looks like from the outside.
 *
 *  "Nothing there" is two different situations and they must not be treated
 *  alike: never made, and made then deleted. Showing the plan for the second
 *  brings back a complaint this app already had — deleting the last post of a
 *  campaign made the plan reappear, so deleting looked broken.
 *
 *  An empty post count cannot tell them apart, so it does not try:
 *  `materialisedAt` is stamped the first time a fan-out actually creates
 *  something, and its absence is what says "never made". Campaigns approved
 *  before that stamp existed carry no mark; for them this falls back to the
 *  post count and can show the plan of a campaign whose posts were all deleted.
 *  Accepted knowingly — the alternative is leaving real plans invisible, which
 *  is the worse of the two, and each campaign self-heals the next time it is
 *  saved. */
export function approvedButNothingMade(
  brief: { status?: string; content?: { title?: string }[]; materialisedAt?: string } | null | undefined,
  livePosts: number,
): boolean {
  if (!materialised(brief) || livePosts > 0) return false;
  if ((brief?.materialisedAt ?? "").trim()) return false;
  return plannedItems(brief).length > 0;
}

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
  /** THE link on a content item — the one the form asks for and the one the
   *  designer opens. */
  referenceBriefLink: string;
  /** Retired boxes. The form had four link fields that all fed one link on the
   *  Graphic Request, so "Competitor / Inspiration Link" quietly became the
   *  brief the designer was sent. Only referenceBriefLink can be typed now;
   *  these stay on the type so rows written before that still read back — see
   *  contentBriefLink(). Do not add inputs for them again. */
  referenceImageLink?: string;
  driveLink?: string;
  competitorLink?: string;
  note: string;
}

/** The one link a content item carries, wherever it was typed.
 *
 *  referenceBriefLink FIRST. The old order put driveLink ahead of it, which was
 *  right while Drive was the box the team actually filled — and becomes a trap
 *  the moment it is the only box left: a legacy driveLink would outrank the link
 *  someone just typed, and the form would show one link while the designer got
 *  another. */
export function contentBriefLink(
  item: Pick<BriefContentItem, "referenceBriefLink" | "referenceImageLink" | "driveLink" | "competitorLink">,
): string {
  const first = [item.referenceBriefLink, item.driveLink, item.referenceImageLink, item.competitorLink]
    .map((v) => (v ?? "").trim())
    .find(Boolean);
  return first ?? "";
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
  /** LINE OA broadcast size. Baht is a poor measure of a broadcast — inside the
   *  monthly allowance it costs almost nothing — so the messages are recorded
   *  and priced separately. See lib/data/lineQuota.ts. */
  lineMessages?: number;
  adsByPlatform: AdsPlatformBudget[];
  monthly?: MonthlyBudgetAllocation[];
}

export interface ApprovalLogEntry {
  action: string; by: string; at: string; comment?: string; from?: string; to?: string;
}

/** One tier-A edit made to an already-approved campaign, waiting for the CMO to
 *  wave it through.
 *
 *  The edit is ALREADY LIVE — the campaign kept its status and the fan-out ran,
 *  so nobody's work is blocked while this sits here. What the entry buys is
 *  that the change cannot pass unseen: it stays in the queue until the CMO
 *  clears it (Settings → Approvals), and a weekly Slack reminder counts what is
 *  still open. Resolved entries leave the array and land in `approvalLog`, so
 *  the queue only ever holds outstanding work and the audit trail stays in the
 *  one place people already read it. */
export interface RetroApprovalEntry {
  /** Unique within the campaign — the save timestamp, which is also `at`. */
  id: string;
  at: string;
  by: string;
  /** Tier-A lines: what actually needs the sign-off. Never empty. */
  changes: string[];
  /** Tier-B lines from the same save, kept for context so the CMO reads one
   *  entry per edit rather than a change with half its story missing. */
  minor?: string[];
  /** The status the campaign was in (and kept) when the edit landed. */
  status: string;
}

export interface CampaignBrief {
  id: string;
  /** Human-friendly campaign number — `BRAND_YYMM_NNN`, e.g. "OMD_2609_001". */
  code?: string;
  /** The year-scoped code this campaign carried before 31 Jul 2026
   *  ("OMD-2026-002"). Kept so a number quoted from before the change still
   *  finds its campaign. Never assigned to new campaigns. */
  previousCode?: string;
  /** The hand-written code the campaign name used to carry ("CPN010"), split
   *  out on 31 Jul 2026 so only one number shows. Kept so anything still filed
   *  under the old code — sheets, chat, printed briefs — can be traced back.
   *  Never assigned to new campaigns, and declared here so editing a brief
   *  doesn't drop it from the blob. */
  legacyCode?: string;
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
  /** Store-facing promotion wording, in the customer's words — optional, and it
   *  is what decides whether the campaign reaches Promotion Summary Print at all
   *  (a campaign with nothing to announce in-store simply leaves it blank).
   *  Deliberately separate from `offer`, which is the internal brief's main offer
   *  and is required on every campaign, so it can't express "no promotion". */
  storePromotion?: string;
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
  /** Tier-A edits made after approval that the CMO has not cleared yet. Absent
   *  or empty means nothing is outstanding. */
  pendingApprovals?: RetroApprovalEntry[];
  /** When this plan first turned into real posts/requests/tasks. Absent means
   *  it never did — see approvedButNothingMade. Stamped by saveCampaignBrief on
   *  the fan-out that actually creates something, so a re-save of an already
   *  materialised campaign does not move it. */
  materialisedAt?: string;
  createdAt: string;
}

/** Next `ci-N` / `kr-N` sequence number, safe to resume after items were
 *  removed. Counting surviving items (content.length + kols.length) undercounts
 *  once anything has ever been deleted, and a resumed sequence can collide with
 *  an id still in use — two items then share one id, so editing either one
 *  patches both. Scanning the ids actually in play never collides. */
export function nextSeqFromItems(content: { id: string }[], kols: { id: string }[]): number {
  const maxOf = (items: { id: string }[]) => items.reduce((max, { id }) => {
    const n = Number(id.slice(id.lastIndexOf("-") + 1));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return Math.max(maxOf(content), maxOf(kols)) + 1;
}

// ── Factories ─────────────────────────────────────────────────────────────
export function emptyContentItem(seq: number): BriefContentItem {
  return {
    id: `ci-${seq}`, title: "", subHead: "", requester: "", designer: "Unassigned", approver: "", type: CONTENT_TYPES[0], platforms: [],
    assets: [], publishDate: "", graphicDueDate: "", requiredGraphic: true,
    requiredVideo: false, priority: "Med", status: "Planned",
    captionDirection: "", mainMessage: "", cta: "", productHighlight: "",
    // The three retired link boxes are deliberately absent: a new item has one
    // link field, and seeding empty keys for them would put them straight back
    // into every blob written from here on.
    mandatoryText: "", doDont: "", referenceBriefLink: "", note: "",
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

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The campaign's flight as the label every list shows — and reads back to
 *  filter by period (see parseRowRange in DateFilterBar).
 *
 *  It used to drop the year always, which is fine inside one year and wrong
 *  across New Year: "Oct 1 – Jan 31" reads as a range that ENDS before it
 *  starts, so the campaign overlapped no month and disappeared from every list
 *  that filters by period while still sitting in the database. A range that
 *  crosses years therefore carries both years. */
export function fmtRange(startIso: string, endIso: string): string {
  const one = (iso: string, withYear: boolean) => {
    const [y, m, d] = (iso || "").split("-").map(Number);
    return m ? `${MON_SHORT[m - 1]} ${d}${withYear && y ? ` ${y}` : ""}` : "";
  };
  const crossesYear = !!startIso && !!endIso && startIso.slice(0, 4) !== endIso.slice(0, 4);
  const a = one(startIso, crossesYear), b = one(endIso, crossesYear);
  return a && b ? `${a} – ${b}` : a || b || "TBD";
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

/** True when the post publishes sooner than Creative can possibly deliver, so
 *  "at least N business days out" and "no later than the publish date" cannot
 *  both hold.
 *
 *  Found on production: raising a brief from a post publishing in three days
 *  handed the date picker min > max, which disables every date in every month.
 *  The form could not be submitted and showed no reason — the requester just
 *  saw a calendar where nothing was clickable. When the range inverts the cap
 *  is dropped and the conflict is stated instead, so the choice (move the post,
 *  or accept artwork after it) belongs to a person rather than to a disabled
 *  button. */
export function graphicDueRangeImpossible(publishIso?: string, requestIso?: string): boolean {
  if (!publishIso) return false;
  return minGraphicDueDate(requestIso) > publishIso;
}

/** Business days the final artwork must land BEFORE the post publishes.
 *
 *  Not slack. It is the requester's review, one revision round, and the
 *  scheduling itself. Artwork that arrives on publish day leaves room for none
 *  of those, which is how posts went out unreviewed — or late. */
export const FINAL_AW_BUFFER_DAYS = 2;

export function subtractBusinessDays(startIso: string, days: number): string {
  const start = parseIsoLocal(startIso);
  if (!start) return "";
  const d = new Date(start);
  let removed = 0;
  while (removed < days) {
    d.setDate(d.getDate() - 1);
    if (isBusinessDay(d)) removed += 1;
  }
  return toIsoLocal(d);
}

export interface FinalArtworkDue {
  /** The date the request should carry. "" when nothing can be derived. */
  iso: string;
  /** Derived, and not to be hand-edited — the publish date decides it. */
  fixed: boolean;
  /** The full buffer could not be met: this is the earliest Creative can
   *  physically deliver, and the brief counts as a rush. */
  rushed: boolean;
  reason: string;
}

/** When must the final artwork be in, so the post can go out on its day?
 *
 *  Two kinds of work, two answers — this is the whole point of the rule:
 *
 *  CONTENT work has a publish date, and that date is the fixed point. The
 *  artwork deadline is therefore DERIVED from it (publish − buffer) and locked,
 *  because the deadline is not really a choice: if you want the post live on
 *  the 20th, the artwork has to be in by the 18th. Letting people type this
 *  produced dates equal to the publish date, leaving no review window, and
 *  dates chosen to dodge the lead-time warning.
 *
 *  ADHOC work has no publish date — nothing to derive from — so it stays a
 *  manual choice, floored at the minimum lead time like any other brief.
 *
 *  When the ideal buffer cannot be met, we do NOT silently pick an impossible
 *  date: the date becomes the earliest Creative can actually deliver and the
 *  brief is flagged as a rush, so a person decides whether the month can take
 *  it (or moves the publish date, which is the real fix). */
export function finalArtworkDue(
  publishIso?: string,
  requestIso?: string,
  /** What the Team Calendar says the Final AW deadline is for this month.
   *  When it speaks, it wins — it IS the team's policy, and a constant in code
   *  that disagrees with the calendar on the wall is just a second answer. */
  calendarIso?: string,
): FinalArtworkDue {
  const floor = minGraphicDueDate(requestIso);
  if (calendarIso) {
    // The calendar can name a date that has already gone — planning September
    // in September means its 23-July deadline is long past. Say so, and still
    // give a date somebody can actually hit rather than one nobody can.
    if (calendarIso >= floor) {
      return {
        iso: calendarIso,
        fixed: true,
        rushed: false,
        reason: `ตามปฏิทินทีม · Final AW ของงานเดือนนี้กำหนดไว้ ${calendarIso}`,
      };
    }
    return {
      iso: floor,
      fixed: true,
      rushed: true,
      reason: `เลยเดดไลน์ปฏิทินทีมแล้ว (${calendarIso}) — เร็วสุดที่ทำได้คือ ${floor} จึงนับเป็นงานเร่ง`,
    };
  }
  if (!publishIso) {
    return {
      iso: "",
      fixed: false,
      rushed: false,
      reason: `งาน adhoc — ยังไม่มีวันโพสต์ กำหนดวันส่งงานเอง (เร็วสุด ${floor} · ${GRAPHIC_MIN_BUSINESS_DAYS} วันทำการ)`,
    };
  }
  const target = subtractBusinessDays(publishIso, FINAL_AW_BUFFER_DAYS);
  if (target >= floor) {
    return {
      iso: target,
      fixed: true,
      rushed: false,
      reason: `ล็อกจากวันโพสต์ ${publishIso} − ${FINAL_AW_BUFFER_DAYS} วันทำการ (กันเวลารีวิว + แก้ 1 รอบ)`,
    };
  }
  // Can still be delivered before it publishes, just without the full buffer.
  if (floor <= publishIso) {
    return {
      iso: floor,
      fixed: true,
      rushed: true,
      reason: `เวลาไม่พอสำหรับ buffer ${FINAL_AW_BUFFER_DAYS} วันทำการ — ใช้วันที่เร็วที่สุดที่ทำได้ (${floor}) และนับเป็นงานเร่ง`,
    };
  }
  return {
    iso: floor,
    fixed: true,
    rushed: true,
    reason: `โพสต์ลงวันที่ ${publishIso} แต่งานเร็วสุดคือ ${floor} — artwork จะเสร็จหลังวันโพสต์ ถ้าไม่ต้องการแบบนั้นให้เลื่อนวันโพสต์`,
  };
}

export function emptyBrief(id: string): CampaignBrief {
  return {
    id, name: "", b: "teppen", branch: "", branches: [], objective: OBJECTIVES[0],
    campaignType: CAMPAIGN_TYPES[0], priority: "Med", startDate: "", endDate: "", launchDate: "",
    audience: "", mainMessage: "", offer: "", storePromotion: "", channels: [], concept: "", kvDirection: "",
    successMetrics: [], successGoals: {}, proposalLink: "", plannerOwner: "", approver: "", content: [], kols: [], budget: emptyBudget(),
    status: "Draft", approvalLog: [], createdAt: "",
  };
}

/** The YYMM half of a campaign code, taken from the month the campaign RUNS in
 *  — not the month someone happened to open the form. September work planned in
 *  July is a September campaign, and that is how the team files it.
 *  Falls back to the current month while the brief has no start date yet. */
function codeMonth(startDate?: string): string {
  const iso = /^\d{4}-\d{2}/.test(startDate ?? "") ? startDate! : "";
  if (iso) return iso.slice(2, 4) + iso.slice(5, 7);
  const now = new Date();
  return String(now.getFullYear() % 100).padStart(2, "0") + String(now.getMonth() + 1).padStart(2, "0");
}

/** Next campaign code, `BRAND_YYMM_NNN` — e.g. OMD_2609_001 (agreed 31 Jul 2026,
 *  replacing the year-scoped TPN-2026-003 form).
 *
 *  The running number restarts each month within a brand, so the code says which
 *  brand, which month, and how many that month — three things the team was
 *  reading off the campaign name before. Takes the highest existing number for
 *  that brand+month and adds one, so numbers stay unique without a central
 *  counter.
 *
 *  Caveat that predates this change: `existing` is whatever the browser loaded
 *  when the form opened, so two people creating a campaign for the same brand
 *  and month at the same time still land on the same number. */
export function nextCampaignCode(brand: BrandId, existing: CampaignBrief[], startDate?: string): string {
  const prefix = `${brandCode(brand)}_${codeMonth(startDate)}_`;
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
    // Not must-have: some campaigns genuinely spend nothing (e.g. a Mainichi
    // free-message-quota campaign) — Budget stays a reminder, never a blocker.
    { key: "budget", label: "Budget รวมเท่าไร", done: b.budget.total > 0, must: false },
    { key: "content", label: "มี content item อย่างน้อย 1 ชิ้น + asset size ครบทุก platform", done: b.content.length > 0 && b.content.every((c) => c.platforms.length > 0 && c.platforms.filter(needsAssetSize).every((p) => c.assets.some((a) => a.platform === p))), must: true },
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
  if (brief.content.length === 0) e.push("Please add at least one Content item (Platform)");
  brief.content.forEach((c, i) => {
    const tag = c.title.trim() || `Content #${i + 1}`;
    if (!c.title.trim()) e.push(`Please enter a Content Title for Content #${i + 1}`);
    if (!c.subHead.trim()) e.push(`Please enter a Sub Head for “${tag}”`);
    if (c.platforms.length === 0) e.push(`Please select at least one platform for “${tag}”`);
    c.platforms.filter(needsAssetSize).forEach((p) => {
      if (!c.assets.some((a) => a.platform === p)) e.push(`Please select asset size for ${p}`);
    });
    if (c.requiredGraphic && !c.graphicDueDate) e.push(`Please select a Graphic Due Date for “${tag}”`);
    if (c.requiredGraphic && c.graphicDueDate && !isGraphicDueDateAllowed(c.graphicDueDate, todayIso())) e.push(`Graphic Due Date for “${tag}” must be at least ${GRAPHIC_MIN_BUSINESS_DAYS} business days after Request Date`);
    // Only enforceable when the two limits can both hold; see graphicDueRangeImpossible.
    if (c.requiredGraphic && c.graphicDueDate && c.publishDate && c.graphicDueDate > c.publishDate
        && !graphicDueRangeImpossible(c.publishDate)) e.push(`Graphic Due Date for “${tag}” must not be after Publish Date`);
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
  // Creative work = graphic OR video: both become a Graphic Request request
  // (mirrors saveCampaignBrief's needsCreative), so the preview counts match
  // what Submit will actually create.
  const withGraphic = brief.content.filter((c) => c.requiredGraphic || c.requiredVideo);
  const withoutGraphic = brief.content.filter((c) => !c.requiredGraphic && !c.requiredVideo);
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
