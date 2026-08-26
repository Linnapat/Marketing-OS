// Every decision waiting on ANYONE, in one shape — and, per row, whether it is
// yours to make.
//
// The first version of this module only collected work addressed to the person
// reading it. That is right for a personal inbox and wrong for a team that has
// to keep moving: when an artwork sat for two weeks, nobody outside the one
// person holding it could see that it had, so "why is this late" was a question
// you had to ask in a channel instead of read off a screen.
//
// So a row is emitted for every open decision on a brand you can see, and each
// carries `mine` and `waitingOn`. Rendering splits on `mine`: your own rows get
// the button, everyone else's say who is holding them. The rules for who may
// actually decide did not move an inch — see the per-kind notes below, and note
// that the database enforces its own half regardless (RLS, p12 for money).
//
// Two rules that were bugs before and are load-bearing now:
//
//  1. Artwork is emitted PER LENS. Sign-off became two checks — content
//     accuracy and Visual CI, by two different people — and the queue was still
//     asking the pre-split question ("am I the requester"), so the Creative
//     Leader who owns every CI verdict had no queue at all.
//
//  2. VDO is its own kind. workKind() has classified it since it existed; the
//     inbox just never asked, and reels stayed buried under "Graphic".
//
// Everything here is pure: no fetching, no React. The page owns the data, this
// owns the rules — so /my-approvals and /my-tasks can never disagree.

import type { BrandId, BrandFilterValue } from "@/lib/brands";
import type { CampaignRow } from "@/lib/data/campaigns";
import type { ContentItem } from "@/lib/data/content";
import type { RequestRow } from "@/lib/data/requests";
import type { Task } from "@/lib/data/tasks";
import type { ExpenseReq } from "@/lib/db/finance";
import type { Graphic, GraphicDeliverable, ReviewLens, WorkKind } from "@/lib/data/graphic";
import {
  REVIEW_LENSES, LENS_META, normSize, lensAskWho, awaitsBriefUnlockDecision, awaitsStoryboardDecision, findLinkedPost, type LinkablePost,
  canPassLens, canReleaseBriefEdit, workKind,
} from "@/lib/data/graphic";
import { captionAwaitsApproval, captionOwner, captionReviewer, contentDateIso } from "@/lib/data/content";
import { isSamePerson } from "@/lib/identity";
import { DEFAULT_APPROVER } from "@/lib/approval";

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

interface RowBase {
  key: string;
  /** Null only where the source row carries a brand LABEL rather than an id. */
  b: BrandId | null;
  /** The campaign this decision belongs to, by name — what the filter at the
   *  top of the queue offers, and what the card already prints. Empty where the
   *  source row carries none (an ad-hoc request), which the filter treats as
   *  "cannot say" rather than hiding it. */
  campaign: string;
  waitingSince: string;
  /** Is this decision ADDRESSED to the person reading it — theirs to make,
   *  not merely one they are senior enough to make?
   *
   *  These were one flag and it made the CMO's queue useless: the CMO may cover
   *  either artwork lens, sign any caption and release any brief, so every
   *  piece of creative work in the company counted as "waiting on you" — 77 of
   *  them on the day this was reported, of which about none were actually the
   *  CMO's to answer. Ownership and permission are different questions:
   *  `mine` drives the "ของฉัน" list and the counts, `canAct` drives the
   *  buttons. A stand-in still gets the buttons; they just no longer get
   *  somebody else's queue. */
  mine: boolean;
  /** May they give this verdict at all — the role rule, standing overrides
   *  included. Never whether the row exists. */
  canAct: boolean;
  /** Who handed this in — the designer who exported the file, the person who
   *  wrote the caption, whoever raised the request. Blank where the source row
   *  names nobody. Paired with `waitingSince` (the date they handed it in) and
   *  `postDate`, these are the three columns the list shows: who, when, and
   *  what it is holding up. */
  submittedBy: string;
  /** The day the work is due to go out (ISO), when there is a post behind it.
   *  Absent for decisions with no publish date of their own — a campaign, a
   *  budget line — rather than borrowed from something else. */
  postDate?: string;
  /** Who is holding it, for the rows that are not yours. A name where we have
   *  one, otherwise the role that owns the decision. */
  waitingOn: string;
}

export type ApprovalRow =
  | (RowBase & { kind: "caption"; post: ContentItem })
  | (RowBase & {
      kind: "artwork" | "vdo" | "photo";
      g: Graphic; deliverable: GraphicDeliverable; index: number; lens: ReviewLens;
      /** Every platform this one file is delivered to. The row is the artwork,
       *  not the platform row it was read from. */
      platforms: string[];
    })
  // Split rather than one member with a two-value kind, so that
  // Extract<ApprovalRow, { kind: "storyboard" }> resolves to the row instead of
  // `never` — the list renders a different component for each.
  | (RowBase & { kind: "storyboard"; g: Graphic })
  | (RowBase & { kind: "briefUnlock"; g: Graphic })
  | (RowBase & { kind: "campaign"; c: CampaignRow })
  | (RowBase & { kind: "request"; r: RequestRow })
  | (RowBase & { kind: "expense"; r: ExpenseReq })
  | (RowBase & { kind: "kol"; t: Task });

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

const firstName = (...names: (string | null | undefined)[]) =>
  names.map((n) => (n ?? "").trim()).find(Boolean) ?? "";

export interface ApprovalCtx {
  /** Every string this person is filed under — see lib/identity. */
  myKeys: Set<string>;
  /** Their display name, for the lens rules, which compare names on the row. */
  me: string;
  /** Their real role from useAuth — never the "Viewing as" switcher. */
  role: string;
  canApproveCampaign: boolean;
  canApproveExpense: boolean;
  /** May they see company-wide spending at all? Money is the one lane the
   *  "everyone sees everything" rule does not cover — see the expense loop. */
  canSeeSpending: boolean;
  canEditContentPlan: boolean;
  /** Resolved by name, so a row can say who to chase rather than which role.
   *  Blank until the member list lands — callers fall back to the role name. */
  creativeLeader?: string;
  cmoName?: string;
  /** Senior Graphic Designers — the CI lane's second pair of eyes. */
  ciBackup?: string[];
  isVisible: (b: BrandId) => boolean;
  /** Task rows carry a brand LABEL, not a BrandId, so they need their own test. */
  canSeeBrandLabel: (label?: string | null) => boolean;
  doneIds: Set<number>;
}

/** Graphic-side decisions: storyboards, brief top-ups, and one row per artwork
 *  lens still open — whoever owns it.
 *
 *  The lens loop is the whole point. `d.review[lens]` already holds a verdict →
 *  that half is done, whoever gave it, and no row is emitted. What is left is
 *  every open check; canPassLens then answers only whether it is THIS person's
 *  to give (right role for the lens, not the person who gave the other verdict,
 *  not the person who submitted the piece). */
export function selectGraphicApprovals(
  graphics: Graphic[],
  ctx: ApprovalCtx,
  /** The Content Plan, for the "goes out on" column. Optional so the callers
   *  that only care about the decisions (and the tests) need not carry it; the
   *  column simply reads "—" without it. */
  posts: LinkablePost[] = [],
): ApprovalRow[] {
  const out: ApprovalRow[] = [];
  for (const g of graphics) {
    if (!ctx.isVisible(g.b)) continue;
    const isRequester = isSamePerson(g.requester, ctx.myKeys);
    // Resolved once per request, not once per row: a five-size artwork emits
    // ten rows and findLinkedPost walks the whole Content Plan each time.
    const linked = posts.length ? findLinkedPost(g, posts) : null;
    const postDate = linked ? contentDateIso(linked as ContentItem) : undefined;

    if (awaitsStoryboardDecision(g)) {
      out.push({
        kind: "storyboard", key: `g${g.id}:storyboard`, b: g.b, campaign: g.campaign ?? "", g,
        waitingSince: g.storyboardSubmittedAt || g.createdAt || "",
        // Whose it is: the person who asked for the work. The CMO keeps the
        // standing override the drawer already gives them (canDecideStoryboard).
        mine: isRequester,
        canAct: isRequester || ctx.role === DEFAULT_APPROVER,
        submittedBy: firstName(g.storyboardOwner, g.designer),
        postDate,
        waitingOn: firstName(g.requester, "ผู้ขอเปิดงาน"),
      });
    }

    const kind = KIND_OF_WORK[workKind(g.type, g.requiredVideo)];

    /* One row per ARTWORK per lens — not per platform row.
     *
     * A 9:16 export delivered to Facebook, Instagram and TikTok is three rows
     * in the deliverables table and ONE file to look at. The queue used to
     * emit all three, so the same job appeared three times per lens; worse,
     * pressing "ผ่าน" on one cleared the other two, because applyLensVerdict
     * has always fanned a verdict across the artwork group (same normSize).
     * The list was showing work that a single click made disappear.
     *
     * Grouped on normSize, the same key artworkGroup and the billing count use,
     * so "one artwork" means the same thing here as everywhere else. */
    const waiting = (g.deliverables ?? [])
      .map((d, index) => ({ d, index }))
      .filter(({ d }) => d.status === "Waiting review");
    const groups = new Map<string, { members: { d: GraphicDeliverable; index: number }[]; platforms: string[] }>();
    for (const item of waiting) {
      const key = normSize(item.d.size);
      const group = groups.get(key) ?? { members: [], platforms: [] };
      group.members.push(item);
      const platform = (item.d.platform || "").trim();
      if (platform && !group.platforms.includes(platform)) group.platforms.push(platform);
      groups.set(key, group);
    }

    for (const [sizeKey, group] of groups) {
      for (const lens of REVIEW_LENSES) {
        // Members that still owe this verdict. Normally all or none — the fan
        // keeps them in step — but a row settled before the fan existed must
        // not take its siblings' open decision off the board with it.
        const pending = group.members.filter((m) => !m.d.review?.[lens]);
        if (!pending.length) continue;
        const { d, index } = pending[0];
        const canPass = canPassLens(lens, { role: ctx.role, isRequester, me: ctx.me, deliverable: d });
        out.push({
          kind, key: `g${g.id}:${sizeKey}:${lens}`, b: g.b, campaign: g.campaign ?? "", g, deliverable: d, index, lens,
          platforms: group.platforms,
          waitingSince: d.submittedAt || g.submittedAt || g.createdAt || "",
          // Whose check this is — the requester's for the data, the Creative
          // Leader's for CI. Everyone else who MAY give it (Marketing Manager,
          // CMO) is covering, and covering is not owning: they keep the buttons
          // through canAct without the row landing in their own queue.
          mine: canPass && (lens === "info" ? isRequester : ctx.role === "Creative Leader"),
          canAct: canPass,
          submittedBy: firstName(d.submittedBy, g.designer),
          postDate,
          // Whoever can actually give it — the lens owner unless the rules bar
          // them from their own lens (they submitted it, or they signed the
          // other one), in which case the person covering. A queue that names
          // somebody who may not press the button is a queue that does not move.
          waitingOn: firstName(
            lensAskWho(lens, d, { requester: g.requester, creativeLeader: ctx.creativeLeader, cmo: ctx.cmoName, ciBackup: ctx.ciBackup }).name,
            lens === "info" ? "สาย Marketing" : "Creative Leader",
          ),
        });
      }
    }

    if (awaitsBriefUnlockDecision(g)) {
      out.push({
        kind: "briefUnlock", key: `g${g.id}:briefUnlock`, b: g.b, campaign: g.campaign ?? "", g,
        waitingSince: g.briefUnlock?.requestedAt || g.createdAt || "",
        // Not the person who asked — they are waiting on the answer, not
        // holding it, however senior they are. The lane belongs to the Creative
        // Leader; the CMO may release one, which is covering, not owning.
        mine: ctx.role === "Creative Leader" && !isSamePerson(g.briefUnlock?.requestedBy ?? "", ctx.myKeys),
        canAct: canReleaseBriefEdit(ctx.role) && !isSamePerson(g.briefUnlock?.requestedBy ?? "", ctx.myKeys),
        submittedBy: firstName(g.briefUnlock?.requestedBy, g.requester),
        postDate,
        waitingOn: "Creative Leader",
      });
    }
  }
  return out;
}

/** A campaign still waiting on somebody. The two pending statuses wait on
 *  different people and neither waits on the whole company:
 *    Waiting for Approval → the CMO decides
 *    Ready for Review     → nobody approves it; its OWNER still has to submit */
const campaignPending = (c: CampaignRow) =>
  ["Waiting for Approval", "Ready for Review"].includes((c.status ?? "").trim());

/** Stages that still need someone in the approval tier to act. */
const PENDING_REQ_STAGES = new Set(["Submitted", "CMO Review", "Revision"]);

/** The whole inbox: every open decision on a visible brand, oldest first, each
 *  tagged with whether it is the reader's to make. */
export function buildApprovalRows(input: {
  captions: ContentItem[];
  graphics: Graphic[];
  campaigns: CampaignRow[];
  requests: RequestRow[];
  expenses: ExpenseReq[];
  kol: Task[];
}, ctx: ApprovalCtx): ApprovalRow[] {
  const rows: ApprovalRow[] = [];

  // ── Captions ────────────────────────────────────────────────────────────
  // Addressed to the person who asked for the post; only an unaddressed one
  // falls back to the planning side, so nothing is stranded with no owner.
  for (const post of input.captions) {
    if (!captionAwaitsApproval(post) || !ctx.isVisible(post.b)) continue;
    const reviewer = captionReviewer(post);
    // Nobody signs off their own words. captionOwner, not post.owner: on a post
    // still marked "Unassigned" the planner IS the writer, and reading the raw
    // field let them approve themselves.
    const wroteIt = captionOwner(post).toLowerCase() === ctx.me.trim().toLowerCase();
    rows.push({
      kind: "caption", key: `c:${post.id}`, b: post.b, campaign: post.campaign ?? "", post,
      waitingSince: post.createdAt || "",
      // Addressed, or nobody's. An unaddressed caption (legacy rows, posts
      // added straight to the calendar) is still CLEARABLE by the planning side
      // — that is why it is not stranded — but it is not counted as anyone's
      // own work, which is how every one of them ended up in the CMO's queue.
      mine: !wroteIt && !!reviewer && isSamePerson(reviewer, ctx.myKeys),
      canAct: !wroteIt && (reviewer ? isSamePerson(reviewer, ctx.myKeys) : ctx.canEditContentPlan),
      submittedBy: captionOwner(post),
      postDate: contentDateIso(post),
      waitingOn: firstName(reviewer, "ฝ่ายวางแผน"),
    });
  }

  rows.push(...selectGraphicApprovals(input.graphics, ctx, input.captions));

  // ── Campaigns ───────────────────────────────────────────────────────────
  for (const c of input.campaigns) {
    if (!campaignPending(c) || !ctx.isVisible(c.b)) continue;
    const forApproval = (c.status ?? "").trim() === "Waiting for Approval";
    rows.push({
      kind: "campaign", key: `cam:${c.id}`, b: c.b, campaign: c.name ?? "", c, waitingSince: "",
      // Signing a campaign off IS the approver's own job, so here owning and
      // being allowed are the same question.
      mine: forApproval
        ? ctx.canApproveCampaign
        // Fail-closed on a blank name: while the member row loads, `me` is ""
        // and an owner-less campaign would match everybody.
        : !!ctx.me.trim() && (c.owner ?? "").trim() === ctx.me.trim(),
      canAct: forApproval
        ? ctx.canApproveCampaign
        : !!ctx.me.trim() && (c.owner ?? "").trim() === ctx.me.trim(),
      submittedBy: firstName(c.owner),
      waitingOn: forApproval ? DEFAULT_APPROVER : firstName(c.owner, "เจ้าของแคมเปญ"),
    });
  }

  // ── Requests ────────────────────────────────────────────────────────────
  // Budget cards are excluded — they appear as actionable expense rows below.
  for (const r of input.requests) {
    if (!PENDING_REQ_STAGES.has(r.stage) || r.type === "Budget" || !ctx.isVisible(r.b)) continue;
    rows.push({
      kind: "request", key: `req:${r.id}`, b: r.b, campaign: r.campaign ?? "", r, waitingSince: "",
      mine: isSamePerson(r.approver, ctx.myKeys),
      canAct: isSamePerson(r.approver, ctx.myKeys),
      submittedBy: firstName(r.requester),
      waitingOn: firstName(r.approver, "ผู้อนุมัติ"),
    });
  }

  // ── Expenses ────────────────────────────────────────────────────────────
  // Money is the exception to this queue's whole premise. Everything else is
  // shown to everyone on a visible brand, because "why is this late" should be
  // readable off a screen rather than asked in a channel. Amounts are not that
  // kind of fact: what a KOL was paid or what a shoot cost is not everybody's
  // business, and a queue that quietly published it would be a worse leak for
  // being convenient. So the lane needs Finance ≥ View (canSeeAllSpending) —
  // the same line the Spending Log draws — and simply does not exist for
  // anyone else.
  //
  // Belt and braces on purpose: RLS already decides what fetchExpenseRequests
  // returns, so this gate is tidying rather than the boundary. But it is read
  // from the permissions matrix, which is where an admin expects to change it.
  //
  // Deciding one is a separate, stricter gate (Finance ≥ Approve + the CMO
  // check inside the RPC — see security_p12_expense_approval.sql), carried on
  // each row as `mine`.
  for (const r of input.expenses) {
    if (!ctx.canSeeSpending) break;
    if (r.status !== "Waiting Approval" || !ctx.isVisible(r.b)) continue;
    rows.push({
      kind: "expense", key: `exp:${r._id ?? r.ref ?? `${r.b}-${r.category}`}`, b: r.b, campaign: r.campaign ?? "", r,
      waitingSince: r.createdAt || "",
      // The expense row carries no approver column — the gate IS the role, so
      // whoever holds it owns these rather than covering for somebody.
      mine: ctx.canApproveExpense, canAct: ctx.canApproveExpense,
      submittedBy: firstName(r.requester),
      waitingOn: DEFAULT_APPROVER,
    });
  }

  // ── KOL proposals ───────────────────────────────────────────────────────
  for (const t of input.kol) {
    if (t.status !== "Need Approval" || ctx.doneIds.has(t.id) || !ctx.canSeeBrandLabel(t.brand)) continue;
    rows.push({
      kind: "kol", key: `kol:${t.id}`, b: null, campaign: t.campaign ?? "", t, waitingSince: "",
      mine: isSamePerson(t.assignee, ctx.myKeys),
      canAct: isSamePerson(t.assignee, ctx.myKeys),
      // A KOL task carries no submitter of its own — the row IS the proposal,
      // and naming the approver here would read as "handed in by the person
      // waiting on it".
      submittedBy: "",
      waitingOn: firstName(t.assignee, "ผู้อนุมัติ"),
    });
  }

  return rows.sort(byWaitingLongest);
}

/* ── Narrowing the queue ───────────────────────────────────────────────────
 *
 * Brand and campaign, as chips over rows the viewer is already ALLOWED to see.
 * The permission cut happens earlier, in buildApprovalRows (ctx.isVisible) —
 * these two only narrow what is on screen, and what they hide is reported by
 * FilterSummary. A filter that hides silently and a permission that hides
 * permanently must never look the same to the person reading the list.
 */

/** The platforms one artwork goes to, short enough for a list. Past three it
 *  is the count that matters, not the names. */
export function platformLabel(platforms: string[] | undefined, fallback = ""): string {
  const list = (platforms ?? []).filter(Boolean);
  if (!list.length) return fallback;
  if (list.length <= 3) return list.join(" · ");
  return `${list.slice(0, 2).join(" · ")} +${list.length - 2}`;
}

/** One line naming what this decision is about — for the compact lists (the
 *  bell) that have no room for a card. The full cards read their own source
 *  row; this exists so a summary list cannot invent a different name for the
 *  same thing. */
export function approvalTitle(row: ApprovalRow): string {
  switch (row.kind) {
    case "caption": return row.post.title || "(ไม่มีชื่อโพสต์)";
    case "artwork":
    case "vdo":
    // The lens belongs in the name: a piece needing both checks produces two
    // rows, and without it a compact list reads as the same job listed twice.
    case "photo": return [row.g.title, platformLabel(row.platforms, row.deliverable.platform), LENS_META[row.lens].short].filter(Boolean).join(" · ");
    case "storyboard": return `${row.g.title} · storyboard`;
    case "briefUnlock": return `${row.g.title} · ขอเติมบรีฟ`;
    case "campaign": return row.c.name || row.c.id;
    case "request": return row.r.title || row.r.type;
    case "expense": return [row.r.category, row.r.campaign].filter((v) => v && v !== "—").join(" · ");
    case "kol": return row.t.title;
  }
}

/** Campaign names present in these rows, for the filter's options. */
export function approvalCampaigns(rows: ApprovalRow[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const name = (r.campaign ?? "").trim();
    if (!name || name === "—") continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "th"));
}

/** Does this row survive the brand chip?
 *
 *  A row whose source carries a brand LABEL rather than an id (KOL tasks) has
 *  no id to compare, so it stays: it was already brand-scoped on the way in
 *  (ctx.canSeeBrandLabel), and dropping it here would hide a decision on the
 *  grounds that we could not read its brand. */
export function matchesApprovalBrand(row: ApprovalRow, brand: BrandFilterValue): boolean {
  if (brand === "all") return true;
  return row.b === null || row.b === brand;
}

/** Does this row survive the campaign chip? A row with no campaign is not the
 *  campaign you picked, so it goes — and is counted as hidden, not vanished. */
export function matchesApprovalCampaign(row: ApprovalRow, campaign: string): boolean {
  if (campaign === "all") return true;
  return (row.campaign ?? "").trim().toLowerCase() === campaign.trim().toLowerCase();
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
