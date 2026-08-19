/* Status Dashboard — every work item in the OS, grouped under its campaign.
 *
 * Each module speaks its own status vocabulary: campaigns have 12 words, KOL
 * ~25, tasks 7, expenses 7, graphics 3 per deliverable, and a content post
 * carries four at once (caption / asset / approval / publish). None of them
 * compare across modules, so everything is mapped onto one small set of health
 * states and the board reads in a single glance.
 *
 * Pure on purpose — no fetching here, so the mapping is testable without a DB.
 * See scripts/test-status-board.ts. */

import { BrandId } from "@/lib/brands";
import { ContentItem, contentDateIso, captionOwner } from "@/lib/data/content";
import { Graphic, isVideoWork, jobHolder, needsStoryboard } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";
import { Tone } from "@/lib/status";

/** The shared vocabulary every module is mapped onto, ordered worst-first.
 *
 *  `notStarted` deliberately outranks `active`: untouched work is the bigger
 *  risk, and it is what should surface when a post rolls its four axes up —
 *  a finished caption with no artwork must read as "Asset not started", not as
 *  "Caption in progress". */
export const HEALTH_ORDER = ["blocked", "waiting", "notStarted", "active", "done"] as const;
export type Health = (typeof HEALTH_ORDER)[number];

export const HEALTH_META: Record<Health, { label: string; tone: Tone }> = {
  blocked: { label: "ติดปัญหา", tone: "red" },
  waiting: { label: "รออนุมัติ", tone: "gold" },
  active: { label: "กำลังทำ", tone: "blue" },
  notStarted: { label: "ยังไม่เริ่ม", tone: "neutral" },
  done: { label: "เสร็จ", tone: "green" },
};

/** Campaign id used for work whose campaign can't be resolved. Deliberately
 *  visible on the board — silently dropping the rows is how work goes missing
 *  after a campaign is renamed. */
export const UNASSIGNED = "__unassigned__";

export type ModuleKey = "content" | "graphic" | "vdo" | "storyboard" | "shooting" | "kol" | "task" | "expense";

export const MODULE_LABEL: Record<ModuleKey, string> = {
  content: "Content",
  graphic: "Graphic",
  // Artwork and video editing are raised on the same request form, so the board
  // read them as one "Graphic" lane — but a designer's queue and an editor's
  // queue are different people, different rates and different deadlines, and
  // filtering to one of them was impossible. Split on isVideoWork(), the app's
  // single answer to "is the finished piece a video", so this lane can never
  // disagree with the Slack room the same request notifies or the kind the post
  // view prints on the same job.
  vdo: "VDO ตัดต่อ",
  // Storyboard and Shooting are STEPS of a graphic request, not separate
  // records — but they are separately owned (Creative Content draws, a shooter
  // shoots) and separately late, and rolled into "Graphic" the board could not
  // show either. They surface as their own rows off the same request.
  storyboard: "Story board",
  shooting: "Shooting",
  kol: "KOL",
  task: "Task",
  expense: "Expense",
};

export interface WorkItem {
  id: string;
  module: ModuleKey;
  title: string;
  campaignId: string;
  brand?: BrandId;
  health: Health;
  /** The module's own word, kept so the board can show what it actually says. */
  rawStatus: string;
  owner?: string;
  /** Deadline, where the module keeps one. Tasks, graphic requests and content
   *  posts do; expenses only carry a display label ("Jul 5") and KOL rows none
   *  at all, so those read as undated rather than as comfortably on time. */
  dueIso?: string;
  urgency: Urgency;
}

/* ── time ────────────────────────────────────────────────────────────────
 *
 * Health alone stopped discriminating: of 283 live items, 275 map to
 * notStarted, because "todo", "new request", "waiting design", "request" and
 * "draft" all mean the same thing to the board. A wall one colour answers
 * "is there work?" — which nobody needed to ask — and hides the 21 items that
 * are already past their date. Time is the axis that separates them. */

export type Urgency = "overdue" | "dueSoon" | "later" | "none";

export const URGENCY_META: Record<Urgency, { label: string; tone: Tone }> = {
  overdue: { label: "เลยกำหนด", tone: "red" },
  dueSoon: { label: "ครบกำหนดใน 7 วัน", tone: "gold" },
  later: { label: "ยังมีเวลา", tone: "neutral" },
  none: { label: "ไม่มีกำหนด", tone: "neutral" },
};

/** Days counted as "due soon". A week: long enough to act, short enough that
 *  the bucket does not swallow the whole quarter. */
export const DUE_SOON_DAYS = 7;

/** Date arithmetic in UTC, never local. Building the date locally and reading
 *  it back with toISOString() shifts it a day backwards everywhere east of
 *  Greenwich — in Bangkok the seven-day window silently became six. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Finished work is never late, however old its date — marking it overdue is
 *  how a board fills with red that no longer means anything. */
export function urgencyOf(dueIso: string | undefined, health: Health, todayIso: string, soonDays = DUE_SOON_DAYS): Urgency {
  if (health === "done") return "none";
  const due = (dueIso ?? "").slice(0, 10);
  if (!due) return "none";
  if (due < todayIso) return "overdue";
  return due <= addDays(todayIso, soonDays) ? "dueSoon" : "later";
}

/** Stamps urgency onto items the adapters produced. Kept separate so "today"
 *  enters the pipeline once, at the edge, instead of every adapter reading a
 *  clock of its own. */
export function withUrgency(items: WorkItem[], todayIso: string, soonDays = DUE_SOON_DAYS): WorkItem[] {
  return items.map((i) => ({ ...i, urgency: urgencyOf(i.dueIso, i.health, todayIso, soonDays) }));
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/* ── per-module status → health ──────────────────────────────────────── */

/** Words that mean the same thing wherever they appear. Checked before the
 *  per-module tables so a shared word can't drift between modules.
 *
 *  Exported for the Work Tracker, which scores a post's caption / approval /
 *  publish axes with this same table. A second copy of the vocabulary is how
 *  the two pages would end up disagreeing about the same row. */
export function commonHealth(status: string): Health | null {
  const s = norm(status);
  if (!s) return null;
  // "approved" counts as done for the lane that owns it. A content post is not
  // finished just because its approval axis is Approved — the publish axis is
  // scored separately and drags the roll-up back down.
  if (["done", "completed", "complete", "published", "posted", "paid", "final", "approved", "approved to post"].includes(s)) return "done";
  if (["stuck", "blocked", "rejected", "cancelled", "canceled", "revision", "need revision", "revision requested", "unpaid"].includes(s)) return "blocked";
  if (["waiting approval", "waiting for approval", "need approval", "waiting review", "waiting feedback", "in review", "ready for review", "pending", "draft submitted"].includes(s)) return "waiting";
  if (["in progress", "active", "producing", "content creating", "publishing", "scheduled", "scheduled in os", "queued", "waiting", "working"].includes(s)) return "active";
  // "request" / "new request" are the opening state of a KOL row and a graphic
  // request, not work in flight — status.ts already tones them neutral.
  // "waiting design" is waiting on an asset that does not exist yet, which is
  // not started rather than waiting on an approver.
  if (["draft", "todo", "to do", "not started", "not submitted", "missing", "no asset", "prospect", "planning", "inactive", "request", "new request", "waiting design", "—", "-"].includes(s)) return "notStarted";
  return null;
}

export function taskHealth(status: string): Health {
  return commonHealth(status) ?? "active";
}

export function expenseHealth(status: string): Health {
  return commonHealth(status) ?? "waiting";
}

export function kolHealth(status: string): Health {
  const s = norm(status);
  if (["shortlisted", "negotiating", "contract pending", "brief sent", "owner assigned"].includes(s)) return "active";
  if (["contract signed", "reporting"].includes(s)) return "active";
  if (["paused"].includes(s)) return "blocked";
  return commonHealth(status) ?? "active";
}

/** A graphic request is as healthy as its weakest deliverable: one asset still
 *  unsubmitted means the request is not done, however many others are approved. */
export function graphicHealth(g: Pick<Graphic, "deliverables" | "stage">): Health {
  const dels = g.deliverables ?? [];
  if (!dels.length) return commonHealth(g.stage) ?? "notStarted";
  const healths = dels.map((d) => commonHealth(d.status) ?? "active");
  return worstHealth(healths);
}

/** What the board prints beside the badge for a graphic request.
 *
 *  The stage alone contradicted the badge on 20 live rows: a request sits at
 *  "In Progress" from the moment someone accepts it, while every deliverable
 *  starts at "Not submitted" — and the badge scores the deliverables, on
 *  purpose, so that work nobody has handed anything in for stays visible as
 *  risk (see HEALTH_ORDER). Both statements were true and the row read as if
 *  one of them were a lie.
 *
 *  Printing the count alongside turns the contradiction into an explanation:
 *  "In Progress · ส่งแล้ว 0/3" beside "ยังไม่เริ่ม" says exactly why. */
export function graphicRowStatus(g: Pick<Graphic, "deliverables" | "stage">): string {
  const dels = g.deliverables ?? [];
  if (!dels.length) return g.stage;
  const submitted = dels.filter((d) => d.status !== "Not submitted").length;
  return `${g.stage} · ส่งแล้ว ${submitted}/${dels.length}`;
}

/** Content posts carry four independent axes. The CMO asked for one rolled-up
 *  status, so the post reports its weakest stage — a finished caption with no
 *  artwork reads as blocked on Asset, not as half done. `stage` names which
 *  axis decided it, so the board can say why without opening the post. */
export function contentHealth(c: Pick<ContentItem, "captionStatus" | "assetStatus" | "approvalStatus" | "publishStatus">): { health: Health; stage: string } {
  const axes: [string, string][] = [
    ["Caption", c.captionStatus],
    ["Asset", c.assetStatus],
    ["Approval", c.approvalStatus],
    ["Publish", c.publishStatus],
  ];
  const scored = axes.map(([stage, raw]) => ({ stage, raw, health: commonHealth(raw) ?? "active" as Health }));
  const worst = worstHealth(scored.map((s) => s.health));
  const decider = scored.find((s) => s.health === worst);
  return { health: worst, stage: decider?.stage ?? "Caption" };
}

/** Worst = earliest in HEALTH_ORDER. An empty list is treated as not started. */
export function worstHealth(healths: Health[]): Health {
  if (!healths.length) return "notStarted";
  for (const h of HEALTH_ORDER) if (healths.includes(h)) return h;
  return "notStarted";
}

/* ── grouping ────────────────────────────────────────────────────────── */

export interface CampaignGroup {
  campaignId: string;
  name: string;
  brand?: BrandId;
  status?: string;
  items: WorkItem[];
  counts: Record<Health, number>;
  /** Worst health across the group — what the campaign row shows collapsed. */
  health: Health;
  /** Items not yet finished. The number the CMO actually scans for. */
  openCount: number;
  /** Open work already past its date — what decides where this campaign sorts. */
  overdueCount: number;
  dueSoonCount: number;
}

export function emptyCounts(): Record<Health, number> {
  return { blocked: 0, waiting: 0, active: 0, notStarted: 0, done: 0 };
}

/** The line at the top of the board: what needs a person today, in four
 *  numbers, before any scrolling. */
export interface BoardSummary {
  total: number;
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  waiting: number;
}

export function summarise(items: WorkItem[]): BoardSummary {
  const open = items.filter((i) => i.health !== "done");
  return {
    total: items.length,
    open: open.length,
    overdue: open.filter((i) => i.urgency === "overdue").length,
    dueSoon: open.filter((i) => i.urgency === "dueSoon").length,
    blocked: open.filter((i) => i.health === "blocked").length,
    waiting: open.filter((i) => i.health === "waiting").length,
  };
}

/* ── who is it sitting with? ─────────────────────────────────────────────
 *
 * The board grouped by campaign only, which answers "how is this campaign
 * doing" but never "who do I go and talk to". Every module already records an
 * owner — designer, assignee, requester — so the answer was in the data the
 * whole time, just never rolled up. */

export interface OwnerLoad {
  owner: string;
  total: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  waiting: number;
  byModule: Record<ModuleKey, number>;
  items: WorkItem[];
}

/** Work with nobody's name on it. Shown, never hidden: an unowned overdue item
 *  is worse than an owned one, because nobody is even expected to move it. */
export const NO_OWNER = "__no_owner__";

export function groupByOwner(items: WorkItem[]): OwnerLoad[] {
  const open = items.filter((i) => i.health !== "done");
  const byOwner = new Map<string, OwnerLoad>();

  for (const item of open) {
    const raw = (item.owner ?? "").trim();
    const key = !raw || /^unassigned$/i.test(raw) ? NO_OWNER : raw;
    let load = byOwner.get(key);
    if (!load) {
      load = {
        owner: key, total: 0, overdue: 0, dueSoon: 0, blocked: 0, waiting: 0,
        byModule: { content: 0, graphic: 0, vdo: 0, storyboard: 0, shooting: 0, kol: 0, task: 0, expense: 0 },
        items: [],
      };
      byOwner.set(key, load);
    }
    load.total += 1;
    load.items.push(item);
    load.byModule[item.module] += 1;
    if (item.urgency === "overdue") load.overdue += 1;
    if (item.urgency === "dueSoon") load.dueSoon += 1;
    if (item.health === "blocked") load.blocked += 1;
    if (item.health === "waiting") load.waiting += 1;
  }

  // Most overdue first — the person to talk to today. Unowned work sinks to
  // the bottom: it is a queue to assign, not a person to chase.
  return [...byOwner.values()].sort((a, b) => {
    if ((a.owner === NO_OWNER) !== (b.owner === NO_OWNER)) return a.owner === NO_OWNER ? 1 : -1;
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    if (a.dueSoon !== b.dueSoon) return b.dueSoon - a.dueSoon;
    if (a.total !== b.total) return b.total - a.total;
    return a.owner.localeCompare(b.owner);
  });
}

/** Every number a campaign row prints, derived from the items it currently
 *  holds. Exported because the board filters a group's items after grouping —
 *  and a row keeping counts from before the filter is a row arguing with the
 *  list underneath it: filter to VDO and the header still totalled the artwork.
 *  One derivation, so grouping and filtering can never disagree. */
export function recount(g: Pick<CampaignGroup, "items">): Pick<CampaignGroup, "counts" | "health" | "openCount" | "overdueCount" | "dueSoonCount"> {
  const counts = emptyCounts();
  for (const i of g.items) counts[i.health] += 1;
  const open = g.items.filter((i) => i.health !== "done");
  return {
    counts,
    health: worstHealth(g.items.map((i) => i.health)),
    openCount: g.items.length - counts.done,
    overdueCount: open.filter((i) => i.urgency === "overdue").length,
    dueSoonCount: open.filter((i) => i.urgency === "dueSoon").length,
  };
}

/** Buckets work items under their campaign. Campaigns with no work still get a
 *  row (an empty campaign is a real signal), and items whose campaignId matches
 *  no campaign land in the UNASSIGNED group instead of vanishing. */
export function groupByCampaign(
  campaigns: { id: string; name: string; b?: BrandId; status?: string }[],
  items: WorkItem[],
): CampaignGroup[] {
  const groups = new Map<string, CampaignGroup>();
  const make = (id: string, name: string, brand?: BrandId, status?: string): CampaignGroup => ({
    campaignId: id, name, brand, status, items: [], counts: emptyCounts(), health: "done", openCount: 0,
    overdueCount: 0, dueSoonCount: 0,
  });

  for (const c of campaigns) groups.set(c.id, make(c.id, c.name, c.b, c.status));

  for (const item of items) {
    let g = groups.get(item.campaignId);
    if (!g) {
      g = groups.get(UNASSIGNED) ?? make(UNASSIGNED, "ไม่ระบุแคมเปญ");
      groups.set(UNASSIGNED, g);
    }
    g.items.push(item);
  }

  for (const g of groups.values()) Object.assign(g, recount(g));

  // Worst first, then most open work, then by name — so whatever needs the
  // CMO's attention is at the top without any filtering. Two buckets are
  // pinned to the bottom regardless of health: UNASSIGNED (a data-hygiene
  // bucket, not a campaign) and campaigns with no work at all, which would
  // otherwise float up on `notStarted` and bury the campaigns in flight.
  return [...groups.values()].sort((a, b) => {
    if ((a.campaignId === UNASSIGNED) !== (b.campaignId === UNASSIGNED)) return a.campaignId === UNASSIGNED ? 1 : -1;
    const ea = a.items.length === 0, eb = b.items.length === 0;
    if (ea !== eb) return ea ? 1 : -1;
    // Lateness outranks health: a campaign of 41 untouched items that are all
    // weeks away is not the one to open first, and sorting by volume put it on
    // top. Overdue work is the only thing that cannot wait.
    if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
    if (a.dueSoonCount !== b.dueSoonCount) return b.dueSoonCount - a.dueSoonCount;
    const ha = HEALTH_ORDER.indexOf(a.health), hb = HEALTH_ORDER.indexOf(b.health);
    if (ha !== hb) return ha - hb;
    if (a.openCount !== b.openCount) return b.openCount - a.openCount;
    return a.name.localeCompare(b.name);
  });
}

/* ── adapters: each module's rows → WorkItem ─────────────────────────── */

export function contentItems(rows: ContentItem[]): WorkItem[] {
  return rows.map((c) => {
    const { health, stage } = contentHealth(c);
    return {
      id: `content:${c.id}`, module: "content" as const, title: c.title,
      campaignId: c.campaignId ?? "", brand: c.b, health,
      rawStatus: health === "done" ? "Published" : `${stage}: ${statusOfStage(c, stage)}`,
      // The content planner while no writer has been assigned — an unwritten
      // caption on an approved campaign has an owner, and the board saying
      // "ยังไม่มีเจ้าของ" is what let 40 of them sit unread.
      owner: captionOwner(c),
      // The publish date IS the deadline for a post: artwork or caption still
      // missing the day before it goes out is late, whatever the asset says.
      dueIso: contentDateIso(c),
      urgency: "none",
    };
  });
}

function statusOfStage(c: ContentItem, stage: string): string {
  if (stage === "Asset") return c.assetStatus;
  if (stage === "Approval") return c.approvalStatus;
  if (stage === "Publish") return c.publishStatus;
  return c.captionStatus;
}

/** Rows for every graphic request — artwork lands in "graphic", video edits in
 *  "vdo". One adapter over one fetch on purpose: the lane is a property of the
 *  row, and two adapters filtering the same array is how two answers to "is
 *  this a video" get to exist. */
export function graphicItems(rows: Graphic[]): WorkItem[] {
  return rows.map((g) => ({
    id: `graphic:${g.id}`, module: isVideoWork(g) ? ("vdo" as const) : ("graphic" as const), title: g.title,
    campaignId: g.campaignId ?? "", brand: g.b, health: graphicHealth(g),
    rawStatus: graphicRowStatus(g), owner: jobHolder(g) ?? g.designer,
    dueIso: g.dueIso, urgency: "none",
  }));
}

/** Storyboard step: not started → submitted (waiting on the requester) →
 *  approved. "Revision" is blocked, because the step cannot move until someone
 *  redraws it. */
export function storyboardHealth(g: Pick<Graphic, "storyboardStatus">): Health {
  switch (g.storyboardStatus) {
    case "Approved": return "done";
    case "Submitted": return "waiting";
    case "Revision": return "blocked";
    default: return "notStarted";
  }
}

/** Shooting step. The signal worth surfacing is a shoot day that has passed
 *  with no footage handed over — everything downstream is stuck on it, and
 *  nothing else on the board says so. */
export function shootingHealth(
  g: Pick<Graphic, "requiresShooting" | "shooter" | "shootDate" | "footageLink">,
  todayIso: string,
): Health {
  if (g.footageLink?.trim()) return "done";
  const day = (g.shootDate ?? "").slice(0, 10);
  if (day && day < todayIso) return "blocked";
  if (day || g.shooter?.trim()) return "active";
  return "notStarted";
}

/** Rows for the storyboard step of every request that needs one.
 *
 *  `dueFor` lets the caller supply the Team Calendar's storyboard deadline for
 *  the month the request serves; without it the request's own due date stands
 *  in. Injected rather than imported so this file stays pure and testable. */
export function storyboardItems(
  rows: Graphic[],
  dueFor?: (g: Graphic) => string | undefined,
): WorkItem[] {
  return rows.filter(needsStoryboard).map((g) => ({
    id: `storyboard:${g.id}`, module: "storyboard" as const,
    title: g.title, campaignId: g.campaignId ?? "", brand: g.b,
    health: storyboardHealth(g),
    rawStatus: g.storyboardStatus || "ยังไม่ส่ง",
    owner: g.storyboardOwner?.trim() || "Creative Content",
    dueIso: dueFor?.(g) ?? g.dueIso,
    urgency: "none",
  }));
}

/** Rows for the shooting step of every request that needs footage first. */
export function shootingItems(rows: Graphic[], todayIso: string): WorkItem[] {
  return rows.filter((g) => g.requiresShooting).map((g) => ({
    id: `shooting:${g.id}`, module: "shooting" as const,
    title: g.title, campaignId: g.campaignId ?? "", brand: g.b,
    health: shootingHealth(g, todayIso),
    rawStatus: g.footageLink?.trim() ? "ส่ง footage แล้ว" : g.shootDate ? `ถ่าย ${g.shootDate}` : "ยังไม่กำหนดวันถ่าย",
    owner: g.shooter?.trim() || "ยังไม่ระบุคนถ่าย",
    // The shoot day IS this step's deadline — the artwork due date belongs to
    // the artwork, and using it here would call a missed shoot "on time".
    dueIso: g.shootDate,
    urgency: "none",
  }));
}

export function taskItems(rows: Task[], doneIds: Set<number>): WorkItem[] {
  return rows.map((t) => ({
    id: `task:${t.id}`, module: "task" as const, title: t.title,
    campaignId: t.campaignId ?? "",
    health: doneIds.has(t.id) ? "done" : taskHealth(t.status),
    rawStatus: t.status, owner: t.assignee, dueIso: t.dueIso, urgency: "none",
  }));
}

export function expenseItems(rows: { _id?: number; campaignId?: string; category: string; b: BrandId; status: string; requester?: string }[]): WorkItem[] {
  return rows.map((e) => ({
    id: `expense:${e._id}`, module: "expense" as const, title: e.category,
    campaignId: e.campaignId ?? "", brand: e.b, health: expenseHealth(e.status),
    rawStatus: e.status, owner: e.requester, urgency: "none",
  }));
}

export function kolItems(rows: { id: string | number; campaignId?: string; name: string; b?: BrandId; status: string; owner?: string }[]): WorkItem[] {
  return rows.map((k) => ({
    id: `kol:${k.id}`, module: "kol" as const, title: k.name,
    campaignId: k.campaignId ?? "", brand: k.b, health: kolHealth(k.status),
    rawStatus: k.status, owner: k.owner, urgency: "none",
  }));
}
