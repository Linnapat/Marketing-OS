// Agency Portal — a self-contained EXTERNAL task list shared with outside
// partners. Deliberately isolated from the internal task modules: an agency
// sees and edits only these external deliverables, never internal campaigns,
// budgets, or reports.

import { BrandId } from "@/lib/brands";

export type AgencyStatus = "To Do" | "In Progress" | "Submitted" | "Revision" | "Approved";
export const AGENCY_STATUSES: AgencyStatus[] = ["To Do", "In Progress", "Submitted", "Revision", "Approved"];

// Statuses an external agency may set themselves; "Approved" is internal-only.
export const AGENCY_EDITABLE_STATUSES: AgencyStatus[] = ["To Do", "In Progress", "Submitted", "Revision"];

export const AGENCY_STATUS_TONE: Record<AgencyStatus, [string, string]> = {
  "To Do": ["#9A9387", "#F2F0EB"],
  "In Progress": ["#3E5C9A", "#EEF1F8"],
  "Submitted": ["#C68A1E", "#FBF8EE"],
  "Revision": ["#B33A2E", "#FFF5F4"],
  "Approved": ["#4E7A4E", "#EEF4EE"],
};

/** May the portal show a row of brand `b` to this viewer?
 *
 *  An agency user's `brandAccess` is "External only", which resolves to NO
 *  internal brands at all — deliberately, so /campaigns and every other
 *  internal screen stays shut to them. Feeding that same answer into the
 *  portal's own row filter emptied the one page they are meant to live on:
 *  six live requests assigned to GID, and a board reading "ไม่มีงานในมุมนี้".
 *
 *  The portal does not need a brand gate. Its rows are already scoped by
 *  OWNERSHIP, twice: RLS (owns_designer_slot / agency_email) will not serve
 *  another supplier's work, and the page matches the signed-in person by name
 *  before a row is built at all. Brand is a filter the viewer picks here, not
 *  a second wall.
 *
 *  Internal staff opening the portal are still scoped normally — they read it
 *  as one more internal screen, and their brand access means what it always
 *  does. */
export function portalBrandAllowed(isAgency: boolean, brandVisible: boolean): boolean {
  return isAgency || brandVisible;
}

export const AGENCY_TYPES = ["Graphic", "Video", "Content", "Photo", "Print"];

/** The identity of one row in the Agency Portal.
 *
 *  Graphic rows key on the request's own id AS TEXT. The portal used to mint a
 *  number for them — `Number(\`9${g.id}\`)` — and a graphic id is already a
 *  16-digit stamp (1786677991073005), so the extra "9" pushed it past
 *  Number.MAX_SAFE_INTEGER and the last digits were rounded away. Requests
 *  minted milliseconds apart, which is exactly how the campaign fan-out mints
 *  them, collapsed onto ONE key: 28 live rows in 7 groups, the largest 8 rows
 *  deep. The list keyed its lookup on that number, so clicking a job's title
 *  opened whichever sibling had won the collision — while clicking the size
 *  line underneath, which passes the real id, opened the right one. */
export function portalRowKey(t: Pick<AgencyTask, "id" | "graphicId" | "source">): string {
  return t.source === "graphic" && t.graphicId ? `graphic-${t.graphicId}` : `manual-${t.id}`;
}

export interface AgencyTask {
  id: number;
  /** When this row is derived from Graphic Request / Graphic Request.
   *  A STRING, because a graphic's blob id is a 16-digit stamp and every
   *  arithmetic form of it is one careless prefix away from losing digits —
   *  see portalRowKey. */
  graphicId?: string;
  source?: "manual" | "graphic";
  title: string;
  b: BrandId;
  campaign: string;
  type: string;
  status: AgencyStatus;
  due: string;
  brief: string;   // read-only brief from the internal team
  link: string;    // agency-editable deliverable link
  note: string;    // agency-editable message to the team
  /** Which external user this task belongs to (members.email). Empty/legacy
   *  rows are visible to every agency user until assigned. */
  agencyEmail?: string;
}

export const AGENCY_TASKS: AgencyTask[] = [
  { id: 1, title: "Songkran key visual set (3 sizes)", b: "teppen", campaign: "Songkran Teppanyaki", type: "Graphic", status: "In Progress", due: "Jul 5", brief: "Hero KV + IG story + LINE cover. Teppanyaki grill, water-splash motif, gold accents.", link: "", note: "" },
  { id: 2, title: "Wagyu Festival hero video (30s)", b: "teppen", campaign: "Wagyu Festival", type: "Video", status: "Submitted", due: "Jul 3", brief: "30s cut for IG Reels + TikTok, subtitles TH/EN, close-up sizzle shots.", link: "https://drive.google.com/agency/wagyu-hero-v2", note: "V2 uploaded — please review the color grade." },
  { id: 3, title: "Father's Day carousel (6 slides)", b: "omakase", campaign: "Father's Day Set", type: "Content", status: "To Do", due: "Jul 8", brief: "6-slide IG carousel, set menu highlight + booking CTA.", link: "", note: "" },
  { id: 4, title: "Cocktail Hour menu — print artwork", b: "touka", campaign: "Cocktail Hour Launch", type: "Print", status: "Revision", due: "Jul 6", brief: "A5 double-sided menu, CMYK, 3mm bleed. Revise: darker background per brand.", link: "https://drive.google.com/agency/touka-menu-v1", note: "" },
  { id: 5, title: "LINE coupon banner", b: "mainichi", campaign: "LINE Coupon Drive", type: "Graphic", status: "Approved", due: "Jun 30", brief: "1040×1040 LINE rich message, coupon code + expiry.", link: "https://drive.google.com/agency/mainichi-line", note: "Final delivered. Thanks!" },
  { id: 6, title: "Omakase tasting reel (teaser)", b: "omakase", campaign: "Omakase Tasting Menu", type: "Video", status: "To Do", due: "Jul 12", brief: "15s teaser, chef plating shots, no voiceover — music only.", link: "", note: "" },
];
