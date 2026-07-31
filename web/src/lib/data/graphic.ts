// Graphic / Creative Request — ported from Graphic.dc.html. Requests carry the full
// workflow schema (brief completeness, blocker, versions, feedback thread) so the board,
// list, and 6-tab detail drawer all read from one shape.

import { BrandId, brandName } from "@/lib/brands";
import { Tone } from "@/lib/status";
import { RushStatus } from "@/lib/data/briefDeadline";

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
   *  Submit doesn't fan out duplicate requests.
   *
   *  sourceContentItemId is NOT unique on its own — it is the brief's row
   *  number ("ci-1", "ci-2", …) and restarts per campaign, so live data has
   *  "ci-1" in 13 different campaigns. Only the pair identifies anything. */
  campaignId?: string;
  sourceContentItemId?: string;
  /** The Content Plan post this request produces artwork for, by post id.
   *  Optional on purpose: POSM, posters and menu artwork are real creative
   *  work that never becomes a social post, and used to be forced through a
   *  placeholder post just to exist here. */
  contentPostId?: string;
  /** Urgent-work sign-off. Set when the brief broke the monthly deadline, the
   *  lead time or the daily cap: the request still exists, but production is
   *  held until Creative Leader (or the CMO) decides. See lib/data/briefDeadline. */
  rushStatus?: RushStatus;
  /** What it broke, stamped at submit so the decision is not re-derived later
   *  against a cap that has since moved. */
  rushBreaches?: string[];
  /** Why it could not wait — the requester's own words. */
  rushReason?: string;
  rushDecidedBy?: string;
  rushDecidedAt?: string;
  rushDecisionNote?: string;
  // ── Shooting step ────────────────────────────────────────────────────
  /** This job needs footage before anyone can design it. It inserts a shooting
   *  step ahead of the artwork.
   *
   *  Genuinely three-valued, and the UI used to hide that behind one checkbox:
   *    undefined — nobody has decided yet
   *    true      — must be shot
   *    false     — decided: no shoot needed
   *  An empty checkbox meant both "not decided" and "decided no", so a designer
   *  looking at a request could not tell whether photos were coming or whether
   *  it was on them to start. Every consumer here already treats undefined and
   *  false alike for pipeline purposes, which stays correct — the difference
   *  matters to the people reading the request, not to the step list. */
  requiresShooting?: boolean;
  /** Existing photos / files for the designer to work from — the answer to
   *  "no shoot, so what do I use?". Kept separate from footageLink, which is
   *  specifically what a shooter handed over, and from the brief's reference
   *  link, which is inspiration rather than source material. */
  designerPhotosLink?: string;
  /** Who shoots. A person, not a work type — "Jeeno - shooting" used to be a
   *  whole assignee entry, which made the shoot look like someone's job title
   *  rather than a step this request happens to need. */
  shooter?: string;
  /** Shoot day (ISO). Movable: shoots get rained off and cast get sick, and
   *  the old model had nowhere to say so. */
  shootDate?: string;
  /** Footage / photos handed over by the shooter. Until this exists the
   *  designer has nothing to work from, so asset submission is blocked. */
  footageLink?: string;
  footageNote?: string;
  footageSubmittedBy?: string;
  footageSubmittedAt?: string;

  // ── Storyboard step (reel / video work) ──────────────────────────────
  /** Creative Content owner who draws the storyboard. */
  storyboardOwner?: string;
  storyboardLink?: string;
  storyboardStatus?: StoryboardStatus;
  storyboardSubmittedBy?: string;
  storyboardSubmittedAt?: string;
  storyboardDecidedBy?: string;
  storyboardDecidedAt?: string;
  /** Why the requester sent the storyboard back. */
  storyboardNote?: string;

  /** Creative has taken the job on — set by "รับงาน" in the drawer.
   *
   *  This is the point of no return for the planning side: once a designer has
   *  started, Marketing may no longer rewrite the post underneath them. An
   *  explicit action rather than an inferred one (assigned, or stage moved to
   *  In Progress) because the lock has to be something a person chose and can
   *  be pointed at — "the stage changed" is not an answer to "who locked this?" */
  acceptedBy?: string;
  acceptedAt?: string;
  /** Permission to top up the brief AFTER Creative has taken the job on.
   *  See briefUnlockState / canEditBriefNow below for the rule. */
  briefUnlock?: BriefUnlock;
  /** Notices raised when the planner edited or moved the post this request
   *  serves. Shown as a banner on the request so Creative sees the change
   *  where the work is, not in a channel they may have muted. */
  notices?: GraphicNotice[];
  /** When the request was raised, from the table's own column. Needed to age a
   *  request nobody has touched yet — its history is empty, so there is nothing
   *  else to measure "waiting since" from. */
  createdAt?: string;
  history?: GraphicEvent[];
}

export type StoryboardStatus = "" | "Waiting" | "Submitted" | "Approved" | "Revision";

/* ── Production pipeline: storyboard → shoot → artwork ─────────────────────
 *
 * A reel is not one job. Someone storyboards it, someone shoots it, and someone
 * cuts it — and until now the request only modelled the last of those, so the
 * first two happened in chat and the designer was "late" for footage that had
 * never arrived. These rules put the earlier steps in front of the artwork and
 * refuse the asset submission until they are done.
 *
 * All pure, so the gate the button uses and the gate the drawer explains are
 * the same one.
 */

/** Does this request need a storyboard signed off before production?
 *
 *  Reel / Short / video work does. Matches workKind's own video test rather
 *  than inventing a second definition of "is this a video". */
export function needsStoryboard(g: Pick<Graphic, "type" | "requiredVideo">): boolean {
  const kind = workKind(g.type, g.requiredVideo);
  return kind === "vdo" || kind === "vdo_shoot";
}

/** Has the shooter handed the footage over? */
export function footageReady(g: Pick<Graphic, "requiresShooting" | "footageLink">): boolean {
  return !g.requiresShooting || !!g.footageLink?.trim();
}

export type ShootingDecision = "undecided" | "required" | "not_required";

/** Which of the three states the shoot question is actually in.
 *
 *  Exists so "nobody has said yet" stops looking identical to "we decided not
 *  to shoot". The pipeline does not branch on this — productionSteps only cares
 *  whether a shoot step exists — but a person deciding whether to start work
 *  needs the difference, and so does anyone chasing the request. */
export function shootingDecision(g: Pick<Graphic, "requiresShooting">): ShootingDecision {
  if (g.requiresShooting === true) return "required";
  if (g.requiresShooting === false) return "not_required";
  return "undecided";
}

/** Has the requester accepted the storyboard? */
export function storyboardCleared(g: Graphic): boolean {
  return !needsStoryboard(g) || g.storyboardStatus === "Approved";
}

/** What still stops the designer/editor from submitting the finished asset.
 *  Empty = clear to submit. Enforced on the button AND explained in the panel,
 *  from this one list. */
export function productionBlockers(g: Graphic): string[] {
  const out: string[] = [];
  if (!storyboardCleared(g)) {
    out.push(g.storyboardStatus === "Submitted"
      ? "รอเจ้าของงานอนุมัติ storyboard"
      : g.storyboardStatus === "Revision"
        ? "storyboard ถูกส่งกลับแก้ — แก้แล้วส่งใหม่"
        : "ยังไม่มี storyboard — Creative Content ต้องส่งก่อน");
  }
  if (!footageReady(g)) {
    out.push(g.shooter?.trim()
      ? `รอ footage/ภาพจาก ${g.shooter}`
      : "งานนี้ต้องถ่ายก่อน — ยังไม่ได้ระบุคนถ่าย");
  }
  return out;
}

export interface ProductionStep {
  key: "storyboard" | "shoot" | "asset";
  label: string;
  /** Who this step is waiting on, when it is not done. */
  owner: string;
  state: "done" | "active" | "waiting" | "skipped";
  detail: string;
}

/** The request's steps in order, for the drawer's checklist. Exactly one step
 *  is "active" — the thing the request is actually waiting on right now. */
export function productionSteps(g: Graphic): ProductionStep[] {
  const steps: ProductionStep[] = [];
  const sbNeeded = needsStoryboard(g);
  const sbDone = g.storyboardStatus === "Approved";
  if (sbNeeded) {
    steps.push({
      key: "storyboard",
      label: "Storyboard",
      owner: g.storyboardOwner?.trim() || "Creative Content",
      state: sbDone ? "done" : "active",
      detail: sbDone
        ? `อนุมัติโดย ${g.storyboardDecidedBy || "—"}`
        : g.storyboardStatus === "Submitted" ? "ส่งแล้ว รออนุมัติ"
          : g.storyboardStatus === "Revision" ? `ส่งกลับแก้: ${g.storyboardNote || "—"}`
            : "ยังไม่ได้ส่ง",
    });
  }
  if (g.requiresShooting) {
    const shotDone = !!g.footageLink?.trim();
    steps.push({
      key: "shoot",
      label: "ถ่ายงาน",
      owner: g.shooter?.trim() || "ยังไม่ระบุคนถ่าย",
      // A shoot cannot start before the storyboard is signed off, so it is
      // "waiting", not "active", while that is outstanding.
      state: shotDone ? "done" : sbNeeded && !sbDone ? "waiting" : "active",
      detail: shotDone
        ? `ส่ง footage แล้วโดย ${g.footageSubmittedBy || "—"}`
        : g.shootDate ? `กำหนดถ่าย ${g.shootDate}` : "ยังไม่กำหนดวันถ่าย",
    });
  }
  const blocked = productionBlockers(g).length > 0;
  steps.push({
    key: "asset",
    label: "ส่งงาน (asset)",
    owner: g.designer && g.designer !== "Unassigned" ? g.designer : "ยังไม่มี designer",
    state: deliverableProgress(g).ready ? "done" : blocked ? "waiting" : "active",
    detail: blocked ? productionBlockers(g)[0] : `${deliverableProgress(g).approved}/${deliverableProgress(g).total} ชิ้นอนุมัติแล้ว`,
  });
  return steps;
}

/** The day this request's work actually lands on.
 *
 *  A shoot is done on the shoot day, not on the artwork's due date, so the
 *  daily capacity guard has to count it there — otherwise moving a shoot into
 *  next month leaves it weighing on the old month's quota. Falls back to the
 *  due date, which is what every non-shoot request has. */
export function workDayIso(g: Pick<Graphic, "shootDate" | "dueIso">): string {
  return (g.shootDate || g.dueIso || "").slice(0, 10);
}

/** "เดือนที่ทำงานจริง" — YYYY-MM, for reading the load of a month that a moved
 *  shoot has changed. Billing is NOT this: the artwork report files a piece by
 *  the month it was APPROVED, deliberately, and moving a shoot must not move
 *  someone's invoice. */
export function workingMonth(g: Pick<Graphic, "shootDate" | "dueIso">): string {
  return workDayIso(g).slice(0, 7);
}

export interface GraphicNotice {
  at: string;
  by: string;
  text: string;
  /** Dismissed by Creative — kept in history rather than deleted. */
  seen?: boolean;
}

/** Has Creative taken this job on? The single question the edit lock asks. */
export function isAccepted(g: Pick<Graphic, "acceptedAt"> | null | undefined): boolean {
  return !!g?.acceptedAt;
}

/* ── Topping up the brief after Creative has started ───────────────────────
 *
 * Before anyone accepts, the requester fills the brief freely — that is how a
 * request gets complete enough to work on, and gating it would put briefs back
 * where they were, stuck at 38% with the app printing "รอ requester เติม key
 * message" at someone who had nowhere to type.
 *
 * Once Creative accepts, the brief is what somebody is working to, and a
 * silent edit changes the job under them. So a top-up becomes a request:
 * the requester asks, the Creative Leader releases, and only then does the
 * editor open. The grant is spent on save — the next top-up asks again, which
 * is the point of asking at all.
 *
 * Modelled as its own field rather than reusing acceptedAt: "ปล่อยงานคืน"
 * hands the whole job back to Marketing (they may move or rewrite the post),
 * and "you may add a line to the brief" is a much smaller thing to grant.
 * Collapsing the two would mean every typo fix un-accepted the job. */

export interface BriefUnlock {
  status: "Pending" | "Granted" | "Rejected";
  requestedBy: string;
  requestedAt: string;
  /** Why the requester needs to add to the brief — their own words. */
  reason?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export type BriefUnlockState = "none" | "pending" | "granted" | "rejected";

export function briefUnlockState(g: Pick<Graphic, "briefUnlock"> | null | undefined): BriefUnlockState {
  const u = g?.briefUnlock;
  if (!u) return "none";
  if (u.status === "Pending") return "pending";
  if (u.status === "Granted") return "granted";
  return "rejected";
}

/** Only the Creative Leader releases a brief for a top-up.
 *
 *  Deliberately narrower than canAcceptWork (which is any creative-side role,
 *  or the CMO): the queue's capacity is the Creative Leader's to protect, and
 *  a designer agreeing to a brief change on their own is how scope creep gets
 *  in without anyone deciding it. Named role rather than the permissions
 *  matrix, matching the other creative-queue gates in lib/roleGates. */
export function canReleaseBriefEdit(role: string): boolean {
  return (role || "").trim().toLowerCase() === "creative leader";
}

/** May this person open the brief editor right now?
 *
 *  `isRequester` covers the person who raised the request; the CMO is kept
 *  alongside them as the standing override the rest of the app gives them.
 *  Neither bypasses the release once the job is accepted. */
export function canEditBriefNow(
  g: Pick<Graphic, "acceptedAt" | "briefUnlock">,
  opts: { isRequester: boolean; isCmo: boolean },
): boolean {
  if (!opts.isRequester && !opts.isCmo) return false;
  if (!isAccepted(g)) return true;
  return briefUnlockState(g) === "granted";
}

/** Why the editor is closed, in the words the person needs. Empty = it's open. */
export function briefEditBlockedReason(
  g: Pick<Graphic, "acceptedAt" | "briefUnlock" | "acceptedBy">,
  opts: { isRequester: boolean; isCmo: boolean },
): string {
  if (canEditBriefNow(g, opts)) return "";
  if (!opts.isRequester && !opts.isCmo) return "แก้บรีฟได้เฉพาะผู้ขอเปิดงาน (หรือ CMO)";
  const who = g.acceptedBy?.trim() || "Creative";
  switch (briefUnlockState(g)) {
    case "pending": return `ส่งคำขอเติมบรีฟแล้ว — รอ Creative Leader ปล่อยงานให้แก้`;
    case "rejected": return `Creative Leader ยังไม่ปล่อยให้แก้บรีฟรอบนี้ — คุยกับ ${who} ก่อนขอใหม่`;
    default: return `${who} รับงานนี้ไปแล้ว — ต้องขอเติมบรีฟกับ Creative Leader และรอปล่อยงานก่อน`;
  }
}

/** Raise the top-up request. */
export function requestBriefEdit(g: Graphic, by: string, reason: string): Graphic {
  return { ...g, briefUnlock: { status: "Pending", requestedBy: by, requestedAt: new Date().toISOString(), reason: reason.trim() || undefined } };
}

/** Creative Leader's answer. */
export function decideBriefEdit(g: Graphic, by: string, grant: boolean, note?: string): Graphic {
  const prev = g.briefUnlock;
  if (!prev) return g;
  return {
    ...g,
    briefUnlock: {
      ...prev,
      status: grant ? "Granted" : "Rejected",
      decidedBy: by,
      decidedAt: new Date().toISOString(),
      decisionNote: note?.trim() || undefined,
    },
  };
}

/** Spend the grant once the edit is saved, so the next top-up asks again.
 *  A no-op when the job was never accepted (nothing was granted to spend). */
export function consumeBriefUnlock(g: Graphic): Graphic {
  if (briefUnlockState(g) !== "granted") return g;
  const { briefUnlock: _spent, ...rest } = g;
  return rest as Graphic;
}

/** May the planning side still change the post this request serves?
 *
 *  Locked once Creative has accepted: the brief they are working to must not
 *  change under them. Before that, planners edit freely — the request is still
 *  just a queued ask. The CMO is not exempted on purpose: the lock protects
 *  work in flight, and "the CMO said so" is a conversation with Creative, not a
 *  button that silently rewrites what someone is mid-way through. */
export function contentEditLock(g: Graphic | null | undefined): { locked: boolean; reason: string } {
  if (!isAccepted(g)) return { locked: false, reason: "" };
  const who = g?.acceptedBy?.trim() || "Creative";
  const when = g?.acceptedAt ? new Date(g.acceptedAt).toLocaleDateString("th-TH", { dateStyle: "medium" }) : "";
  return {
    locked: true,
    reason: `${who} รับงานนี้แล้ว${when ? ` (${when})` : ""} — แก้ไข/ย้ายแคมเปญไม่ได้ ต้องแจ้ง Creative ให้ปล่อยงานคืนก่อน`,
  };
}

/** Append a notice, newest last, capped so one chatty week cannot bloat the
 *  request's data blob without bound. */
export function withNotice(g: Graphic, by: string, text: string): Graphic {
  const notices = [...(g.notices ?? []), { at: new Date().toISOString(), by, text }];
  return { ...g, notices: notices.slice(-20) };
}

/** Notices Creative has not dismissed yet. */
export function unseenNotices(g: Graphic | null | undefined): GraphicNotice[] {
  return (g?.notices ?? []).filter((n) => !n.seen);
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

/** Assign artwork numbers from the sizes chosen at request time: deliverables
 *  sharing a (normalised) size are ONE artwork — the same master file resized
 *  per platform — numbered 1..n in order of first appearance.
 *
 *  Always recomputed, never read back from the row. The number is derived from
 *  normSize and carries nothing normSize does not already know, so a stored
 *  copy is only ever a stale answer: the 82 deliverables numbered before
 *  normSize compared pixels hold numbers that split one file into three. The
 *  badge and the billing count have to agree, and the only way they can is if
 *  both come from the same live key. */
export function autoNumberDeliverables(dels: GraphicDeliverable[]): GraphicDeliverable[] {
  const bySize = new Map<string, number>();
  let next = 0;
  return dels.map((d) => {
    const key = normSize(d.size);
    if (!bySize.has(key)) bySize.set(key, ++next);
    return { ...d, artworkNo: bySize.get(key) };
  });
}

/* ── Which Content Plan post does this request serve? ──────────────────────
 *
 * Kept pure (no db) so the rule that decides where approved artwork lands is
 * testable on its own. Order matters: each step is narrower than the next, and
 * anything that cannot identify exactly one post returns null rather than
 * guessing — attaching a brand's artwork to another brand's post is worse than
 * attaching nothing, because nobody goes looking for a link that "worked". */

/** Minimal shape of a post; avoids importing the Content module into this one. */
export interface LinkablePost {
  id: string;
  campaign: string;
  campaignId?: string;
  title: string;
  sourceContentItemId?: string;
  graphicRequestId?: string;
}

/** Query param that opens /graphic's brief form already linked to a post:
 *  /graphic?briefFor=<content post id>. A URL rather than shared modal state
 *  because the two forms live on different pages, and it makes "raise a brief
 *  for this post" a link anyone can send. */
export const GRAPHIC_BRIEF_FOR_PARAM = "briefFor";

/** Query param that opens one request's drawer straight away:
 *  /graphic?open=<graphic request id>. The other direction of briefFor — that
 *  one goes post → new brief, this one goes post → the brief it already has.
 *  Content Plan's "ผูกกับ Graphic Request #N ↗" used to link at bare /graphic
 *  and leave you to find #N yourself in a list of forty-odd rows. */
export const GRAPHIC_OPEN_PARAM = "open";

/** What /graphic should do about a ?open=<id> on this render.
 *
 *  Extracted from the page because the first version got the timing wrong in a
 *  way no type or lint catches, and it failed silently: the page seeds its list
 *  with the demo rows, so `graphics.length` is already non-zero on the very
 *  first render. The effect ran then, searched the mock data, found nothing,
 *  marked itself done and dropped the param — and when the real requests
 *  arrived a moment later nothing looked at them. The jump just did nothing.
 *
 *  So the gate is `loaded`, never "the list looks non-empty", and the decision
 *  lives here where it can be replayed in order:
 *    wait → the fetch has not come back; do nothing, stay eligible
 *    open → found it
 *    missing → the fetch is in and the id is not there (deleted, or a brand
 *              this member cannot see). Say so rather than silently landing
 *              on the full list, which is what the old bare link did. */
export function resolveOpenTarget<T extends Pick<Graphic, "id">>(
  openId: string | null,
  graphics: T[],
  loaded: boolean,
  alreadyOpened: boolean,
): { action: "idle" | "wait" | "open" | "missing"; graphic?: T } {
  if (!openId || alreadyOpened) return { action: "idle" };
  if (!loaded) return { action: "wait" };
  const found = graphics.find((g) => String(g.id) === String(openId));
  return found ? { action: "open", graphic: found } : { action: "missing" };
}

const linkKey = (s?: string) => (s ?? "").trim().toLowerCase();

/** Same campaign? Prefer ids; fall back to the name for rows predating them. */
function sameCampaign(post: LinkablePost, g: Graphic): boolean {
  if (post.campaignId && g.campaignId) return post.campaignId === g.campaignId;
  return !!linkKey(post.campaign) && linkKey(post.campaign) === linkKey(g.campaign);
}

/** The only match, or null when there is none or more than one. */
function only<T>(matches: T[]): T | null {
  return matches.length === 1 ? matches[0] : null;
}

export function findLinkedPost(g: Graphic, posts: LinkablePost[]): LinkablePost | null {
  // 1. The request names its post outright (Phase 1 link).
  if (g.contentPostId) {
    const direct = posts.find((p) => p.id === g.contentPostId);
    if (direct) return direct;
    // A stated link that resolves to nothing is a broken link, not a hint to
    // start guessing — the post was deleted, or belongs to another workspace.
    return null;
  }

  // 2. The post points back at this request.
  const backRef = only(posts.filter((p) => p.graphicRequestId && String(p.graphicRequestId) === String(g.id)));
  if (backRef) return backRef;

  // 3. Brief row, scoped to the campaign. Unscoped this was a real hazard:
  //    "ci-1" alone matches posts in 13 campaigns.
  if (g.sourceContentItemId) {
    const scoped = only(posts.filter(
      (p) => p.sourceContentItemId === g.sourceContentItemId && sameCampaign(p, g),
    ));
    if (scoped) return scoped;
  }

  // 4. Legacy rows carrying no ids at all: campaign + exact title. The old
  //    substring variant (g.title.includes(p.title)) matched "Wagyu" against
  //    every post whose title was a fragment of another, so it is gone.
  const titled = linkKey(g.contentItem) || linkKey(g.title);
  if (!titled) return null;
  return only(posts.filter((p) => sameCampaign(p, g) && linkKey(p.title) === titled));
}

/** Every request that belongs to a post — the inverse of findLinkedPost, used
 *  when the post is deleted so its requests do not outlive it.
 *
 *  Deliberately narrower than findLinkedPost. That function has to resolve a
 *  link for DISPLAY, so it falls back to sourceContentItemId and then to
 *  campaign + title; guesses are acceptable when the cost of being wrong is a
 *  mislabelled row. Here the cost is deleting someone's work, so only the two
 *  links that were written down on purpose count:
 *
 *    1. the request names the post   (graphic.contentPostId)
 *    2. the post names the request   (post.graphicRequestId)
 *
 *  A request that merely shares a campaign and a title with the deleted post is
 *  left alone. It will surface as an orphan in the UI, which is recoverable —
 *  unlike a request the app threw away on a title match. */
export function findLinkedGraphics<T extends Pick<Graphic, "id" | "contentPostId">>(
  post: Pick<LinkablePost, "id" | "graphicRequestId">,
  graphics: T[],
): T[] {
  const postId = linkKey(post.id);
  const named = linkKey(post.graphicRequestId);
  if (!postId && !named) return [];
  return graphics.filter((g) =>
    (!!postId && linkKey(g.contentPostId) === postId) ||
    (!!named && linkKey(String(g.id)) === named),
  );
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
/*  Two deliverables are the same piece when they are the same PIXELS, not when
 *  they read the same. Every platform labels its presets differently — one
 *  1080×1920 export is "9:16 Story (1080×1920)" on Facebook, "9:16 Reel/Story
 *  (1080×1920)" on Instagram and "9:16 (1080×1920)" on TikTok — and comparing
 *  the text counted that single file three times. Across live requests that is
 *  98 pieces billed where 66 were made.
 *
 *  The ratio cannot decide it either: Facebook's 1:1 is 1080×1080 while Google
 *  Business Profile's 1:1 is 720×720, and those really are two files.
 *
 *  Sizes carrying no pixels (A4 Poster, Table Tent) fall back to their name,
 *  which is all we know about them. */
export const normSize = (s: string) => {
  const raw = (s || "—").trim().toLowerCase().replace(/\s+/g, " ");
  const px = /(\d{2,5})\s*[×x]\s*(\d{2,5})/.exec(raw);
  return px ? `${px[1]}x${px[2]}` : raw;
};

/** How many distinct ARTWORK pieces a request represents: distinct size,
 *  platform collapsed — the same file used on Facebook and Instagram is one
 *  piece, a different size is separate work. "Same size" means the same pixels
 *  (see normSize), so one export under three platforms' labels counts once. */
export function artworkUnits(g: Pick<Graphic, "deliverables" | "platform" | "size">): number {
  const dels = g.deliverables?.length ? g.deliverables : deriveDeliverables(g as Graphic);
  if (!dels.length) return 1;
  // Counted from the size key alone. Preferring a stored artworkNo let a row
  // numbered under the old label rule outvote the pixels it was numbered from.
  const seen = new Set<string>();
  for (const d of dels) seen.add(normSize(d.size));
  return Math.max(1, seen.size);
}

/** Artwork pieces of `kind` already booked on `dueIso` — the sum of each
 *  request's artworkUnits, so the daily cap counts real pieces, not requests. */
export function countWorkOnDay(graphics: Graphic[], kind: WorkKind, dueIso: string): number {
  if (!dueIso) return 0;
  return graphics
    // workDayIso, not dueIso: a shoot occupies the day it is shot on. Requests
    // without a shoot date are unaffected — it falls back to the due date.
    .filter((g) => workDayIso(g) === dueIso && workKind(g.type, g.requiredVideo) === kind)
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
 *  dig into the drawer. Returns null when nothing is left to approve.
 *
 *  Deliverables `by` submitted themselves are skipped: a bulk action must not
 *  do what the per-row Approve button refuses to do, or the self-approval rule
 *  is one click away from being bypassed. */
export function approveAllWaiting(g: Graphic, by: string): Graphic | null {
  const dels = g.deliverables?.length ? g.deliverables : deriveDeliverables(g);
  const submittedByActor = (d: GraphicDeliverable) => {
    const who = (d.submittedBy ?? "").trim().toLowerCase();
    return !!who && who === (by ?? "").trim().toLowerCase();
  };
  let targets = dels.filter((d) => d.status === "Waiting review");
  // Requests parked in "Waiting Feedback" without per-deliverable review
  // states (legacy rows): approving means everything not yet approved.
  if (!targets.length && g.stage === "Waiting Feedback") {
    targets = dels.filter((d) => d.status !== "Approved");
  }
  targets = targets.filter((d) => !submittedByActor(d));
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

/** The brief fields the requester may fill in themselves, before Creative has
 *  accepted the job.
 *
 *  The system already said this was allowed — contentEditLock's rule is
 *  "planners edit freely until Creative accepts" — but the Brief tab rendered
 *  values only, so a request could sit at 38% complete with the app printing
 *  "รอ requester เติม key message" at someone who had nowhere to type it. The
 *  only route left was LINE, which is how the real brief ends up outside the
 *  request that is supposed to hold it.
 *
 *  What is NOT here matters as much:
 *   - platform / size — the deliverable rows Creative submits against are built
 *     from these. Changing them later rewrites the shape of work in progress.
 *   - contentItem / campaign — moving a request between campaigns is its own
 *     guarded action, not a brief edit.
 *   - anything the Creative side authors (feedback, deliverables, approvals).
 *
 *  Filling these in is deliberately NOT the same as certifying the brief:
 *  canSignOffBrief still refuses the requester, so somebody on the Content or
 *  Creative side has to agree the brief is now good enough to start. */
export const REQUESTER_EDITABLE_BRIEF_FIELDS = [
  "briefLink", "driveLink", "referenceLink",
  "objective", "keyMessage", "moodDirection", "captionCopy", "extraDetails",
] as const;

export type RequesterBriefField = (typeof REQUESTER_EDITABLE_BRIEF_FIELDS)[number];

/** Keep only the fields a requester is allowed to write, dropping everything
 *  else — so a patch built from a form can never carry `stage`, `designer` or
 *  an approval along with it. Values are trimmed; unchanged ones are dropped so
 *  an untouched form writes nothing at all. */
export function pickBriefPatch(
  draft: Partial<Record<RequesterBriefField, string>>,
  current: Graphic,
): Partial<Record<RequesterBriefField, string>> {
  const out: Partial<Record<RequesterBriefField, string>> = {};
  for (const key of REQUESTER_EDITABLE_BRIEF_FIELDS) {
    // Absent ≠ cleared. Reading a missing key as "" made a partial draft look
    // like a request to blank every field it did not mention, so patching one
    // link would have wiped the key message next to it. The form happens to
    // send all eight, which is exactly the kind of luck that stops holding.
    if (!Object.prototype.hasOwnProperty.call(draft, key)) continue;
    const next = (draft[key] ?? "").trim();
    if (next === (current[key] ?? "").trim()) continue;
    out[key] = next;
  }
  return out;
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
