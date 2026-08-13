// Role → capability gates, in ONE place. The first version of the campaign
// gate classified roles through OwnerSelect's memberTeam(), whose regex sends
// "Content Creator" to the Planner bucket — so Content Creator slipped past a
// block meant for every content-production role. Naming the gates explicitly
// (and unit-testing the role strings the team actually uses) keeps the next
// added role from slipping through the same crack.
//
// UI-layer gating like the rest of the app — RLS enforcement is the separate
// post-go-live track.

import { DEFAULT_APPROVER } from "@/lib/approval";

/** Roles that PRODUCE work inside campaigns (graphic, video, content, external
 *  studios) — as opposed to planning/managing them. */
export function isCreativeSideRole(role: string): boolean {
  return /creative|design|graphic|art|video|vdo|content creator|agency|external/i.test(role || "");
}

// ── Content Plan: who may rewrite or move a planned post ──────────────────
// The planning side owns the schedule — "แก้ไขหรือย้ายแคมเปญได้โดย Marketing".
// Creative roles read the plan and produce against it; they do not reschedule
// it, and the request they work from is the thing that locks (contentEditLock).
// Named explicitly rather than derived as "not creative", so a role added later
// gets no schedule-editing power by accident.
const PLANNER_ROLES = ["CMO", "Marketing Manager / BGL", "Marketing Executive", "Co-ordinator"];

/** May this role edit a planned post, or move it to another campaign? */
export function canEditContentPlan(role: string): boolean {
  return PLANNER_ROLES.includes((role || "").trim());
}

// ── Graphic deliverables: who signs off a submitted artwork ────────────────
// The Approve button on a deliverable row had no gate at all: any role that
// could open the Assets tab and saw a row in "Waiting review" could approve it,
// including the designer who had just submitted it. The Permissions matrix says
// Graphic = Approve for Creative Leader and the chain is
// Requester → Creative Leader → Marketing Manager / BGL → CMO, but none of that
// reached the button.
//
// Per-artwork sign-off no longer lives here. It became TWO checks — content
// accuracy and Visual CI — asked separately, by two different people, and the
// rule needs the deliverable itself (who submitted it, who already signed the
// other lens) which a role string cannot carry. See canGiveLensVerdict /
// canPassLens in lib/data/graphic.
//
// canReviewDeliverable / canApproveDeliverable were deleted rather than left
// exported: they answer "may this person approve this piece?" with the old
// one-signature rule, and anything that picked them up again would walk
// straight around the second check.

/** May this person hand a Content Plan post to a writer?
 *
 *  Creative Leader, per the team's flow confirmed on 2026-07-30 — the same
 *  person who hands graphic requests to designers, so one person is answerable
 *  for who is carrying what across both queues. The CMO can act when they are
 *  away, as everywhere else.
 *
 *  Deliberately not the requester: a Marketer who could pick the writer for
 *  their own post would route around whoever is balancing the queue, which is
 *  the same reason canAcceptWork excludes them on the graphic side.
 *
 *  This is what makes caption work findable at all. Until now every post kept
 *  owner "Unassigned" (45 of 50 live posts) with no control anywhere to change
 *  it, so "งานเขียนแคปชั่นไหลเข้า Content creator" had nothing behind it. */
/**
 * May this person accept — or send back — a caption?
 *
 * The planning side, the same people who own the schedule (canEditContentPlan):
 * "marketing revise or approve storyboard / caption" in the agreed flow. Not
 * the creative side, who write it.
 *
 * `me` and `writer` are compared as well, because the writer being on the
 * planning side does not make them their own reviewer — the brief sign-off
 * already draws this line, and a check you can pass by writing it yourself is
 * not a check.
 */
export function canDecideCaption(
  role: string,
  opts: { me: string; writer: string | null | undefined; reviewer?: string | null },
): boolean {
  const me = (opts.me ?? "").trim().toLowerCase();
  const writer = (opts.writer ?? "").trim().toLowerCase();
  const reviewer = (opts.reviewer ?? "").trim().toLowerCase();
  // The person the caption was addressed to decides it, whatever their role.
  // The post's requester is often the Creative Leader, who is not on the
  // planning side — routing the caption to them and then refusing them the
  // button would just move the dead end. The CMO keeps the standing override
  // they have everywhere; what changed is that the caption no longer lands in
  // their queue unless it is actually theirs (see captionReviewer).
  const addressed = !!reviewer && me === reviewer;
  if (!addressed && role !== "CMO" && !canEditContentPlan(role)) return false;
  if (!me || !writer || writer === "unassigned") return true;
  return me !== writer;
}

export function canAssignCaption(role: string): boolean {
  const r = (role || "").trim();
  return r === "Creative Leader" || r === "CMO";
}

/** Whose name may be put in the caption-writer slot (CMO, 2026-08-12).
 *
 *  Handing the words to someone is a different question from who holds them by
 *  default: an unassigned post belongs to its content planner (captionOwner),
 *  and clearing the slot hands it straight back to them. This names the people
 *  the work may be handed ON to.
 *
 *  Anchored, so it matches a whole role rather than any role containing the
 *  word — "Senior Graphic Designer" and "VDO Editor" produce the artwork, they
 *  do not write. Note that these two roles sit in DIFFERENT functional teams
 *  (memberTeam puts Content Creator in Planner and Creative Leader in
 *  Creative), so a picker using this must be scoped to "all" — narrowing by
 *  team first leaves the intersection empty and the dropdown dead. */
export const CAPTION_WRITER_ROLES = /^(content creator|creative leader)$/i;

/**
 * May this person SET UP the production pipeline — pick who draws the
 * storyboard, submit it, decide whether the job needs a shoot, name the
 * shooter and the shoot date?
 *
 * Content Creator and Creative Leader (CMO, 2026-08-02: "คนทำ storyboard,
 * จัดคิวถ่าย = Content creator / Content Leader" — read as Creative Leader,
 * the only Leader role the system has).
 *
 * This was "the whole creative side", which handed shoot scheduling to the
 * Senior Graphic Designer, the VDO Editor and the outside studio as well —
 * an external agency arranging our shoot days being the clearest sign the
 * rule was too wide. Everyone downstream of the plan now reads it instead:
 * they still claim the job and deliver the asset, which are theirs.
 *
 * Read-only, not hidden. "Who is drawing the storyboard" and "is there a shoot
 * first" are the two facts a producer most needs before their own work can
 * start; taking the controls away must not take the answers with them.
 *
 * Same membership as canMarkMediaReleased today, deliberately not the same
 * function: they are two different decisions that happen to sit with the same
 * two people, and folding them together would move both the next time one
 * changes.
 */
export function canRunProductionPipeline(role: string): boolean {
  const r = (role || "").trim();
  return r === "Content Creator" || r === "Creative Leader" || r === "CMO";
}

/**
 * Who may repoint an already-approved artwork at a new address.
 *
 * An agency delivers to their own Drive, the piece is approved from there, and
 * then Creative files the master in the company Dropbox — at which point the
 * approved link points at somebody else's folder, and the link is the only
 * record of where the artwork lives. There was no way to update it: the editor
 * closes on approval, and the only route was to send a passed piece back for
 * revision, which un-approves work nobody objected to and drags the requester
 * through a second sign-off.
 *
 * Creative Leader (and the CMO) only. Not the designer, and never the
 * requester: this is custody of the final file, and a swap after sign-off is
 * exactly the move a looser gate would let through unnoticed. Every change is
 * stamped into the request's history, because "the link changed" and "the
 * artwork changed" look identical from the outside.
 */
export function canRelocateApprovedAsset(role: string): boolean {
  const r = (role || "").trim();
  return r === "Creative Leader" || r === "CMO";
}

/**
 * Nav entries kept out of a role's rail because they are not that role's job —
 * decluttering, not a permission. The Permissions matrix still decides who may
 * open what; these routes stay reachable by a direct link, so a campaign code
 * inside a job someone IS working on still opens.
 *
 * VDO Editor, per the CMO (2026-08-02): a rail of fifteen entries where five
 * are reporting screens they never open buries the four they live in.
 *
 * Team KPI is deliberately kept even though it sits under /performance-center —
 * it is the monthly review of the Creative team, which is them.
 */
const NAV_HIDDEN_BY_ROLE: Record<string, string[]> = {
  "VDO Editor": ["/campaigns", "/platforms", "/performance-center", "/requests", "/expenses"],
};

/** Exact-href match, never a prefix: hiding /performance-center must not take
 *  /performance-center/team-kpi with it. */
export function isNavHiddenFor(role: string, href: string): boolean {
  return (NAV_HIDDEN_BY_ROLE[(role || "").trim()] ?? []).includes(href);
}

/** May this person mark a post's media released — the tick that says the file
 *  is finished and the post may go out?
 *
 *  Content Creator and Creative Leader (CMO, 2026-08-02). Note what this
 *  deliberately splits: whoever produced the file still pastes the link, since
 *  they are the one holding it, but somebody else confirms it is done. An
 *  editor who could both deliver and release their own work would be signing
 *  their own delivery off, which is the same objection the two-lens artwork
 *  review exists to answer.
 *
 *  CMO included as the standing override the rest of these gates give them. */
export function canMarkMediaReleased(role: string): boolean {
  const r = (role || "").trim();
  return r === "Content Creator" || r === "Creative Leader" || r === "CMO";
}

/** May this person raise a graphic brief?
 *
 *  Not the people the briefs are addressed to. The Graphic module level cannot
 *  answer this — it says who may work on graphics, and by that measure a VDO
 *  Editor (Edit) could brief while a Marketing Executive (View) could not,
 *  which is backwards. So the producing side is excluded by name.
 *
 *  Creative Leader keeps it: they own the queue and re-raise work into it.
 *  (CMO, 2026-08-02, asked directly whether a VDO Editor should be able to
 *  send a brief — "ไม่".) */
export function canSendGraphicBrief(role: string): boolean {
  const r = (role || "").trim();
  if (r === "Creative Leader" || r === "CMO") return true;
  return !isCreativeSideRole(r);
}

/**
 * Does this role only work its own queue — its own jobs plus whatever is still
 * unclaimed — rather than the whole board?
 *
 * The Permissions table has said "Own" for the production roles since it was
 * written, and nothing ever read the column; a VDO Editor saw all 22 requests
 * across every brand. Switched on for VDO Editor and Agency (External) per the
 * CMO on 2026-08-02.
 *
 * Agency needs it most and had it least: the sidebar shows them only the
 * portal, but /graphic is not blocked for them (Graphic = Edit in the matrix),
 * so an outside studio typing the URL reached the whole board — every brand,
 * every campaign, every other supplier's jobs.
 *
 * Senior Graphic Designer, Content Creator and KOL Specialist carry the same
 * "Own" in that table and are deliberately NOT switched on here — narrowing
 * what someone can see is not a change to make on a column nobody has read in
 * a year, without the person who runs that queue saying so.
 *
 * Unclaimed work stays visible on purpose. รับงาน is how a producer gets work
 * at all; hiding the pool would leave them a board of only what someone else
 * had already handed them.
 */
export function worksOwnQueueOnly(role: string): boolean {
  const r = (role || "").trim();
  return r === "VDO Editor" || r === "Agency (External)";
}

/** May this person hand a graphic request to a designer?
 *
 *  The claim canAssignCaption already makes — "the same person who hands
 *  graphic requests to designers" — was true of the Content side and of
 *  nothing else: the Assigned Designer dropdown in the graphic drawer had no
 *  gate at all, so a VDO Editor could move any request onto any colleague
 *  while the page above it read "Creative Leader มอบหมาย".
 *
 *  Same rule as the caption queue, and for the same reason: one person is
 *  answerable for who is carrying what. Accepting work yourself is untouched —
 *  canAcceptWork stays open to the whole producing side, because picking up a
 *  job is not the same act as putting it on someone else. */
export function canAssignDesigner(role: string): boolean {
  const r = (role || "").trim();
  return r === "Creative Leader" || r === "CMO";
}

/** May this person clear a rush brief — the one that jumped the monthly
 *  deadline, the lead time or the daily cap?
 *
 *  Creative Leader owns the queue's capacity, so the call is theirs; the CMO
 *  can act when they are away. Deliberately NOT the requester: the whole point
 *  of the gate is that someone other than the person in a hurry decides whether
 *  the month can absorb the work. */
export function canApproveRushBrief(role: string): boolean {
  return role === "Creative Leader" || role === "CMO";
}

// ── Campaign creation: driven by the Settings → Permissions matrix ─────────
// The source of truth the QA verified against. A role may create campaigns
// when its Campaign module level is Edit or higher; "View" means exactly that.
// The saved matrix (permissions table) wins; the seed matrix in
// lib/data/settings is the fallback before an admin ever saves one; a role in
// neither falls back to the creative-side heuristic so a brand-new role fails
// closed on the production side.

import { PERM_MODULES, PERM_ROLES } from "@/lib/data/settings";

export type PermMatrix = Record<string, Record<string, string>>;

const CAMPAIGN_CREATE_LEVELS = ["Edit", "Approve", "Admin"];

/** The shipped defaults, in the same shape fetchPermissions() returns. */
export function seedPermMatrix(): PermMatrix {
  const out: PermMatrix = {};
  for (const r of PERM_ROLES) {
    out[r.role] = {};
    r.perms.forEach((p, i) => { out[r.role][PERM_MODULES[i]] = p.l; });
  }
  return out;
}

/** May this role decide a campaign brief sitting at "Waiting for Approval"?
 *
 *  Named-role rule, deliberately NOT read from the permissions matrix: the
 *  button that actually approves (CampaignDetailView's `canApprove`) asks
 *  `role === "CMO"` and nothing else, and an inbox that offers work the page
 *  behind it will refuse is worse than an inbox that stays empty. Routed
 *  through DEFAULT_APPROVER so "who approves by default" still lives in one
 *  file. */
export function canApproveCampaign(role: string): boolean {
  return role === DEFAULT_APPROVER;
}

/** The role's Campaign-module level per the live matrix (seed as fallback). */
export function campaignPermLevel(role: string, matrix?: PermMatrix | null): string | null {
  return modulePermLevel(role, "Campaign", matrix);
}

/** Opening campaigns follows the Permissions table: Campaign ≥ Edit. An empty
 *  role (demo mode, member row still loading) keeps working; a role the matrix
 *  doesn't know follows the creative-side heuristic. */
export function canCreateCampaign(role: string, matrix?: PermMatrix | null): boolean {
  if (!role) return true;
  const level = campaignPermLevel(role, matrix);
  if (level !== null) return CAMPAIGN_CREATE_LEVELS.includes(level);
  return !isCreativeSideRole(role);
}

// ── Expense approval: the same line the database now draws ────────────────
// The Approval tab used to render for anyone who could open Finance at all,
// so a Marketing Manager / BGL (Finance=View) and a Co-ordinator (Finance=Edit)
// both saw live Approve buttons — and the database let the Co-ordinator's click
// through, because the RPC had no role check and the row policy asked only for
// Finance >= View. supabase/security_p12_expense_approval.sql moved the rule
// into Postgres (has_module('Finance','Approve') + a CMO check inside the RPC);
// this is the matching UI gate, expressed against the same matrix level so the
// two cannot drift apart again.

const APPROVE_LEVELS = ["Approve", "Admin"];

/** The role's level for any module per the live matrix (seed as fallback). */
export function modulePermLevel(role: string, module: string, matrix?: PermMatrix | null): string | null {
  return matrix?.[role]?.[module] ?? seedPermMatrix()[role]?.[module] ?? null;
}

/** May this role decide an expense request (approve or send back)? */
export function canApproveExpense(role: string, matrix?: PermMatrix | null): boolean {
  if (!role) return false; // unknown identity never approves money
  return APPROVE_LEVELS.includes(modulePermLevel(role, "Finance", matrix) ?? "—");
}

/** May this role see company-wide spending (the Spending Log / Finance module)?
 *  Submitting your own request does not require this — everyone may do that. */
export function canSeeAllSpending(role: string, matrix?: PermMatrix | null): boolean {
  if (!role) return false;
  return (modulePermLevel(role, "Finance", matrix) ?? "—") !== "—";
}

/** May this role move a Spending Log row Unpaid → Paid?
 *
 *  Paying the vendor is the Co-ordinator's job, so declaring it paid is theirs
 *  too — the button used to render for everyone who could open the Spending
 *  Log. This is a named-role rule rather than a matrix level because the matrix
 *  has no level that means "handles payments"; Finance=Edit is held by people
 *  who prepare spending, not people who settle it. Mirrored in the database by
 *  supabase/security_p13_mark_paid.sql.
 *
 *  The CMO keeps an override: with one Co-ordinator on the team, no fallback
 *  would strand every unpaid row while they are away. */
export function canMarkPaid(role: string): boolean {
  const r = (role || "").trim();
  return r === "Co-ordinator" || r === "CMO";
}

/** Platform Performance shows company-wide budgets and actual spend with a
 *  "Request revise budget" action — money data, so it follows the same line as
 *  the Finance module: production-side roles (creative + KOL) don't see it.
 *  (CMO decision 2026-07-18: KOL Specialist explicitly closed off.) */
export function canSeePlatformPerformance(role: string): boolean {
  if (/kol|influencer/i.test(role || "")) return false;
  return !isCreativeSideRole(role);
}

// ── Repairing a fan-out that failed ────────────────────────────────────────
// A campaign can sit "Approved" with none of its plan turned into posts,
// graphic requests or tasks — the fan-out is several writes and any one of them
// can fail after the status has already flipped (it did, for every campaign
// approved between 2026-07-29 and the briefVersion fix). The Content tab offers
// "สร้างงานจากแผนนี้" to run it again; saveCampaignBrief is idempotent, so it
// only fills in what is missing.
//
// Wider than canEditContentPlan on purpose. Pressing this decides nothing: the
// CMO already approved these exact items, and the button creates what the
// approved plan says and no more. Gated to the planning side, the work sat dead
// until a planner happened to open the tab — the Creative Leader whose seven
// items they were could see the warning and not the button. Gik's call on
// 2026-08-05: let the person looking at it fix it.
//
// Not "everyone", though — "everyone the database will actually let through".
// The fan-out's first write is an upsert of the campaign row, and campaigns'
// INSERT policy asks has_module('Campaign','Edit'); a button offered to someone
// the row policy refuses is the dead end this app has hit before (Agency ทางตัน,
// AUDIT 2026-08-01). So the gate is the matrix level, read from the SAME live
// permissions table that has_module() reads:
//
//   Campaign ≥ Edit  CMO, Marketing Manager / BGL, Marketing Executive,
//                    Co-ordinator, KOL Specialist, Creative Leader ← Peach
//   Campaign = View  Senior Graphic Designer, VDO Editor, Content Creator
//   Campaign = —     Agency (External)
//
// Note the live matrix has Creative Leader at Edit while the shipped seed still
// says View. Reading the live table is what makes this land where the database
// stands today; raise or lower it in Settings → Permissions and both move.

/** May this person re-run the fan-out for a plan the CMO already approved?
 *
 *  Same level the campaigns INSERT policy requires, so the button and the row
 *  policy cannot disagree. Use the useCanMakeApprovedPlan hook in components —
 *  it supplies the live matrix. */
export function canMakeApprovedPlan(role: string, matrix?: PermMatrix | null): boolean {
  if (!role) return true;  // demo mode, or the member row is still loading
  return CAMPAIGN_CREATE_LEVELS.includes(campaignPermLevel(role, matrix) ?? "—");
}
