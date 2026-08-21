// Every decision waiting on one person, in one shape.
//
// Before this module the approval inbox lived inline in /my-tasks and asked
// each source its own question in its own way. Two things went wrong there and
// both are fixed here:
//
//  1. Artwork was collected with `isSamePerson(g.requester, me)` — the rule
//     from BEFORE sign-off became two checks. The Visual CI verdict belongs to
//     the Creative Leader, who is not the requester, so the person holding half
//     the artwork decisions in the company had no queue at all and had to open
//     requests one by one to find them. Rows are now emitted PER LENS, and only
//     for the lens this person may actually pass (canPassLens) — so an artwork
//     needing both checks shows up on two people's screens, each seeing only
//     their own half.
//
//  2. VDO work was folded into "Graphic work waiting for your approval". The
//     app has classified it separately since workKind() existed; the inbox just
//     never asked. Reels and cut-downs are a different review with a different
//     rhythm, and burying them under Graphic made them impossible to batch.
//
// Everything here is pure: no fetching, no React. The page owns the data, this
// owns the rules — so /my-approvals and /my-tasks can never disagree about
// what is waiting.

import type { BrandId } from "@/lib/brands";
import type { CampaignRow } from "@/lib/data/campaigns";
import type { ContentItem } from "@/lib/data/content";
import type { RequestRow } from "@/lib/data/requests";
import type { Task } from "@/lib/data/tasks";
import type { ExpenseReq } from "@/lib/db/finance";
import type { Graphic, GraphicDeliverable, ReviewLens, WorkKind } from "@/lib/data/graphic";
import {
  REVIEW_LENSES, awaitsBriefUnlockDecision, awaitsStoryboardDecision,
  canPassLens, canReleaseBriefEdit, workKind,
} from "@/lib/data/graphic";
import { isSamePerson } from "@/lib/identity";

/** What a row is, which is also what the filter chips filter by. Artwork, VDO
 *  and Photo are three kinds rather than one "graphic" kind because they are
 *  reviewed differently — see workKind(). */
export type ApprovalKind =
  | "caption" | "artwork" | "vdo" | "photo" | "storyboard" | "briefUnlock"
  | "campaign" | "request" | "expense" | "kol";

/** workKind's four buckets → the three review kinds this inbox shows.
 *  A shoot and a cut are both "VDO" to the person approving them. */
const KIND_OF_WORK: Record<WorkKind, "artwork" | "vdo" | "photo"> = {
  graphic: "artwork",
  vdo: "vdo",
  vdo_shoot: "vdo",
  photo_shoot: "photo",
};

export type ApprovalRow =
  | { kind: "caption"; key: string; b: BrandId; waitingSince: string; post: ContentItem }
  | {
      kind: "artwork" | "vdo" | "photo"; key: string; b: BrandId; waitingSince: string;
      g: Graphic; deliverable: GraphicDeliverable; index: number; lens: ReviewLens;
    }
  | { kind: "storyboard" | "briefUnlock"; key: string; b: BrandId; waitingSince: string; g: Graphic }
  | { kind: "campaign"; key: string; b: BrandId; waitingSince: string; c: CampaignRow }
  | { kind: "request"; key: string; b: BrandId; waitingSince: string; r: RequestRow }
  | { kind: "expense"; key: string; b: BrandId; waitingSince: string; r: ExpenseReq }
  | { kind: "kol"; key: string; b: BrandId | null; waitingSince: string; t: Task };

/** Chip label, icon and the two colours the badge is drawn in. One table so a
 *  kind added later cannot be styled differently in three places. */
export const APPROVAL_META: Record<ApprovalKind, { label: string; icon: string; bg: string; fg: string }> = {
  caption:    { label: "Caption",        icon: "📝", bg: "#F2EEFF", fg: "#6C5CE7" },
  artwork:    { label: "Artwork",        icon: "🎨", bg: "#FBF8EE", fg: "#C68A1E" },
  vdo:        { label: "VDO",            icon: "🎬", bg: "#EDF3FB", fg: "#3E5C9A" },
  photo:      { label: "Photo",          icon: "📸", bg: "#F1F4EF", fg: "#5E7A4E" },
  storyboard: { label: "Storyboard",     icon: "🎞", bg: "#F2EEFF", fg: "#6C5CE7" },
  briefUnlock:{ label: "ขอเติมบรีฟ",      icon: "🔓", bg: "#FBF1E9", fg: "#B3641E" },
  campaign:   { label: "แคมเปญ",          icon: "🎯", bg: "#FBF1E9", fg: "#C2691E" },
  request:    { label: "คำขอ",            icon: "📋", bg: "#EEF1F8", fg: "#3E5C9A" },
  expense:    { label: "เบิกงบ",          icon: "฿",  bg: "#EEF4EE", fg: "#4E7A4E" },
  kol:        { label: "KOL",            icon: "🌟", bg: "#F0F7F0", fg: "#4E7A4E" },
};

/** The order the chips are drawn in — creative work first, because that is what
 *  people come here to clear; money and campaigns already have their own pages. */
export const APPROVAL_KIND_ORDER: ApprovalKind[] = [
  "caption", "artwork", "vdo", "photo", "storyboard", "briefUnlock", "campaign", "request", "expense", "kol",
];

/** How many days a decision has been outstanding, or null when the source row
 *  carries no timestamp to measure from (campaigns and requests do not). Null
 *  is rendered as nothing at all — an invented "0 days" on an old campaign
 *  reads as fresh, which is the opposite of true. */
export function waitingDays(iso: string, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Oldest first, and anything with no age after everything that has one: a row
 *  we cannot age is not evidence that it is new. */
export function byWaitingLongest(a: ApprovalRow, b: ApprovalRow): number {
  if (!a.waitingSince && !b.waitingSince) return 0;
  if (!a.waitingSince) return 1;
  if (!b.waitingSince) return -1;
  return a.waitingSince.localeCompare(b.waitingSince);
}

export interface GraphicApprovalCtx {
  /** Every string this person is filed under — see lib/identity. */
  myKeys: Set<string>;
  /** Their display name, for the lens rules, which compare names on the row. */
  me: string;
  /** Their real role from useAuth — never the "Viewing as" switcher. */
  role: string;
  isVisible: (b: BrandId) => boolean;
}

/** Graphic-side decisions: storyboards, brief top-ups, and one row per artwork
 *  lens still open to this person.
 *
 *  The lens loop is the whole point. `d.review[lens]` already holds a verdict →
 *  that half is done, whoever gave it. canPassLens then answers the rest: right
 *  role for this lens, not the person who gave the other verdict, not the
 *  person who submitted the piece. What survives is exactly the set of
 *  decisions this person can act on right now. */
export function selectGraphicApprovals(graphics: Graphic[], ctx: GraphicApprovalCtx): ApprovalRow[] {
  const out: ApprovalRow[] = [];
  for (const g of graphics) {
    if (!ctx.isVisible(g.b)) continue;
    const isRequester = isSamePerson(g.requester, ctx.myKeys);

    if (isRequester && awaitsStoryboardDecision(g)) {
      out.push({
        kind: "storyboard", key: `g${g.id}:storyboard`, b: g.b, g,
        waitingSince: g.storyboardSubmittedAt || g.createdAt || "",
      });
    }

    const kind = KIND_OF_WORK[workKind(g.type, g.requiredVideo)];
    (g.deliverables ?? []).forEach((d, index) => {
      if (d.status !== "Waiting review") return;
      for (const lens of REVIEW_LENSES) {
        if (d.review?.[lens]) continue;
        if (!canPassLens(lens, { role: ctx.role, isRequester, me: ctx.me, deliverable: d })) continue;
        out.push({
          kind, key: `g${g.id}:d${index}:${lens}`, b: g.b, g, deliverable: d, index, lens,
          waitingSince: d.submittedAt || g.submittedAt || g.createdAt || "",
        });
      }
    });

    // Not shown to the person who asked — they are waiting on the answer, not
    // holding it.
    if (canReleaseBriefEdit(ctx.role) && awaitsBriefUnlockDecision(g)
      && !isSamePerson(g.briefUnlock?.requestedBy ?? "", ctx.myKeys)) {
      out.push({
        kind: "briefUnlock", key: `g${g.id}:briefUnlock`, b: g.b, g,
        waitingSince: g.briefUnlock?.requestedAt || g.createdAt || "",
      });
    }
  }
  return out;
}

/** Wrap the already-filtered lists from the page into rows and sort the whole
 *  inbox as one queue. The filtering rules for these five live where they
 *  always have (they are one-line predicates on the page); what this adds is a
 *  single order across all of them, so "what has been waiting longest" is
 *  answerable without reading six separate sections. */
export function buildApprovalRows(input: {
  captions: ContentItem[];
  graphics: ApprovalRow[];
  campaigns: CampaignRow[];
  requests: RequestRow[];
  expenses: ExpenseReq[];
  kol: Task[];
}): ApprovalRow[] {
  return [
    ...input.captions.map((post): ApprovalRow => ({
      kind: "caption", key: `c:${post.id}`, b: post.b, post, waitingSince: post.createdAt || "",
    })),
    ...input.graphics,
    ...input.campaigns.map((c): ApprovalRow => ({
      kind: "campaign", key: `cam:${c.id}`, b: c.b, c, waitingSince: "",
    })),
    ...input.requests.map((r): ApprovalRow => ({
      kind: "request", key: `req:${r.id}`, b: r.b, r, waitingSince: "",
    })),
    ...input.expenses.map((r): ApprovalRow => ({
      kind: "expense", key: `exp:${r._id ?? r.ref ?? `${r.b}-${r.category}`}`, b: r.b, r,
      waitingSince: r.createdAt || "",
    })),
    ...input.kol.map((t): ApprovalRow => ({
      kind: "kol", key: `kol:${t.id}`, b: null, t, waitingSince: "",
    })),
  ].sort(byWaitingLongest);
}

/** Count per kind, for the chip badges. Every kind is present (as 0) so the
 *  chip row does not reflow as items are cleared. */
export function countByKind(rows: ApprovalRow[]): Record<ApprovalKind, number> {
  const counts = Object.fromEntries(APPROVAL_KIND_ORDER.map((k) => [k, 0])) as Record<ApprovalKind, number>;
  for (const r of rows) counts[r.kind] += 1;
  return counts;
}

/** What approving this expense would do to its campaign's budget — the one
 *  thing the approver must see without opening anything. Pure so the inbox and
 *  My Tasks compute it identically; matching on campaign_id when the row has it
 *  (a rename breaks name matching), else on brand + name — never on name alone,
 *  since names repeat across brands. */
export function expenseBudgetOf(
  campaigns: CampaignRow[], all: ExpenseReq[],
): (r: ExpenseReq) => { budget: number; committed: number; left: number; campaignId: string } | null {
  const sameCampaign = (a: ExpenseReq, b: ExpenseReq) =>
    a.campaignId && b.campaignId ? a.campaignId === b.campaignId : a.b === b.b && a.campaign === b.campaign;
  return (r) => {
    const c = campaigns.find((x) => (r.campaignId ? x.id === r.campaignId : x.b === r.b && x.name === r.campaign));
    if (!c || !c.budget) return null;
    const committed = all
      .filter((x) => x !== r && x.status === "Approved" && sameCampaign(x, r))
      .reduce((s, x) => s + (x.approved || 0), 0);
    return { budget: c.budget, committed, left: c.budget - committed - r.requested, campaignId: c.id };
  };
}
