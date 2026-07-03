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

export const AGENCY_TYPES = ["Graphic", "Video", "Content", "Photo", "Print"];

export interface AgencyTask {
  id: number;
  title: string;
  b: BrandId;
  campaign: string;
  type: string;
  status: AgencyStatus;
  due: string;
  brief: string;   // read-only brief from the internal team
  link: string;    // agency-editable deliverable link
  note: string;    // agency-editable message to the team
}

export const AGENCY_TASKS: AgencyTask[] = [
  { id: 1, title: "Songkran key visual set (3 sizes)", b: "teppen", campaign: "Songkran Teppanyaki", type: "Graphic", status: "In Progress", due: "Jul 5", brief: "Hero KV + IG story + LINE cover. Teppanyaki grill, water-splash motif, gold accents.", link: "", note: "" },
  { id: 2, title: "Wagyu Festival hero video (30s)", b: "teppen", campaign: "Wagyu Festival", type: "Video", status: "Submitted", due: "Jul 3", brief: "30s cut for IG Reels + TikTok, subtitles TH/EN, close-up sizzle shots.", link: "https://drive.google.com/agency/wagyu-hero-v2", note: "V2 uploaded — please review the color grade." },
  { id: 3, title: "Father's Day carousel (6 slides)", b: "omakase", campaign: "Father's Day Set", type: "Content", status: "To Do", due: "Jul 8", brief: "6-slide IG carousel, set menu highlight + booking CTA.", link: "", note: "" },
  { id: 4, title: "Cocktail Hour menu — print artwork", b: "touka", campaign: "Cocktail Hour Launch", type: "Print", status: "Revision", due: "Jul 6", brief: "A5 double-sided menu, CMYK, 3mm bleed. Revise: darker background per brand.", link: "https://drive.google.com/agency/touka-menu-v1", note: "" },
  { id: 5, title: "LINE coupon banner", b: "mainichi", campaign: "LINE Coupon Drive", type: "Graphic", status: "Approved", due: "Jun 30", brief: "1040×1040 LINE rich message, coupon code + expiry.", link: "https://drive.google.com/agency/mainichi-line", note: "Final delivered. Thanks!" },
  { id: 6, title: "Omakase tasting reel (teaser)", b: "omakase", campaign: "Omakase Tasting Menu", type: "Video", status: "To Do", due: "Jul 12", brief: "15s teaser, chef plating shots, no voiceover — music only.", link: "", note: "" },
];
